'use strict'

const moment = require('moment')
const db = require('../services/db')
const log = require('../services/log')('expiry monitor')
const makeAccountBalances = require('./accountBalances')
const updateState = require('./updateState')
const ExpiredTransferError = require('../errors/expired-transfer-error')
const Transfer = require('../models/transfer').Transfer

function TransferExpiryMonitor (timeQueue, notificationWorker) {
  this.queue = timeQueue
  this.notificationWorker = notificationWorker
}

TransferExpiryMonitor.prototype.validateNotExpired = function (transfer) {
  if (transfer.expires_at &&
    moment().isAfter(transfer.expires_at)) {
    throw new ExpiredTransferError('Cannot modify transfer ' +
      'after expires_at date')
  }
}

TransferExpiryMonitor.prototype.expireTransfer = function * (transferId) {
  const _this = this

  yield db.transaction(function *(transaction) {
    let transfer = yield Transfer.findById(transferId, { transaction })

    if (!transfer) {
      log.error('trying to expire transfer that cannot be found ' +
        'in the database: ' + transferId)
      return
    }

    if (!transfer.isFinalized()) {
      updateState(transfer, 'rejected')
      yield transfer.save({ transaction })

      // Return the money to the original senders
      let accountBalances = yield makeAccountBalances(transaction, transfer)
      yield accountBalances.revertDebits()

      log.debug('expired transfer: ' + transferId)

      yield _this.notificationWorker.queueNotifications(transfer, transaction)
    }
  })

  // Should process transfer state notifications soon, because some transfers
  // may have changed state
  this.notificationWorker.scheduleProcessing()
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
    yield this.expireTransfer(id)
  }
}

TransferExpiryMonitor.prototype.unwatch = function (transferId) {
  log.debug('unwatch transfer: ' + transferId)
  this.queue.remove(transferId)
}

exports.TransferExpiryMonitor = TransferExpiryMonitor
