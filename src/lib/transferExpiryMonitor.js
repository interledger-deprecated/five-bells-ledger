'use strict'

const moment = require('moment')
const db = require('../services/db')
const log = require('../services/log')('expiry monitor')
const accountBalances = require('./accountBalances')
const updateState = require('./updateState')
const ExpiredTransferError = require('../errors/expired-transfer-error')
const Transfer = require('../models/transfer').Transfer

function TransferExpiryMonitor (timeQueue) {
  this.queue = timeQueue
}

TransferExpiryMonitor.prototype.validateNotExpired = function (transfer) {
  if (transfer.expires_at &&
    moment().isAfter(transfer.expires_at)) {
    throw new ExpiredTransferError('Cannot modify transfer ' +
      'after expires_at date')
  }
}

function * expireTransfer (transferId) {
  log.debug('about to expire transfer')
  yield db.transaction(function *(transaction) {
    let transfer = yield Transfer.findById(transferId, { transaction })

    if (!transfer) {
      log.error('trying to expire transfer that cannot be found ' +
        'in the database: ' + transferId)
      return
    }

    if (transfer.state !== 'executed' &&
      transfer.state !== 'rejected' &&
      transfer.state !== 'failed') {
      updateState(transfer, 'rejected')
      yield transfer.save({ transaction })

      // Return the money to the original senders
      let accountsToCredit =
      yield accountBalances.calculate(transaction, transfer.debits)
      yield accountBalances.applyCredits(transaction, accountsToCredit)
    }

    log.debug('expired transfer: ' + transferId)
  })
}

TransferExpiryMonitor.prototype.watch = function * (transfer) {
  // Star the expiry countdown if we're not already watching it
  if (!this.queue.includes(transfer.id)) {
    const now = moment()
    const expiry = moment(transfer.expires_at)
    if (transfer.expires_at && now.isBefore(expiry)) {
      yield this.queue.insert(expiry, transfer.id)

      log.debug('transfer ' + transfer.id +
        ' will expire in ' + expiry.diff(now, 'milliseconds') + 'ms')
    }
  } else if (transfer.state === 'executed' ||
    transfer.state === 'rejected' ||
    transfer.state === 'failed') {
    this.unwatch(transfer.id)
  }
}

TransferExpiryMonitor.prototype.processExpiredTransfers = function *() {
  log.debug('checking for transfers to expire')
  const transfersToExpire = this.queue.popBeforeDate(moment())
  for (let id of transfersToExpire) {
    yield expireTransfer(id)
  }
}

TransferExpiryMonitor.prototype.unwatch = function (transferId) {
  log.debug('unwatch transfer: ' + transferId)
  this.queue.remove(transferId)
}

exports.TransferExpiryMonitor = TransferExpiryMonitor
