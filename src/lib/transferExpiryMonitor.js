'use strict'

const moment = require('moment')
const db = require('../services/db')
const log = require('../services/log')('expiry monitor')
const makeAccountBalances = require('./accountBalances')
const updateState = require('./updateState')
const ExpiredTransferError = require('../errors/expired-transfer-error')
const Transfer = require('../models/db/transfer').Transfer
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates

class TransferExpiryMonitor {
  constructor (timeQueue, notificationWorker) {
    this.queue = timeQueue
    this.notificationWorker = notificationWorker
  }

  validateNotExpired (transfer) {
    if (transfer.expires_at &&
      moment().isAfter(transfer.expires_at)) {
      throw new ExpiredTransferError('Cannot modify transfer ' +
        'after expires_at date')
    }
  }

  * expireTransfer (transferId) {
    const _this = this

    yield db.transaction(function * (transaction) {
      let transfer = yield Transfer.findById(transferId, { transaction })

      if (!transfer) {
        log.error('trying to expire transfer that cannot be found ' +
          'in the database: ' + transferId)
        return
      }

      if (!transfer.isFinalized()) {
        updateState(transfer, transferStates.TRANSFER_STATE_REJECTED)
        transfer.rejection_reason = 'expired'
        yield transfer.save({ transaction })

        // Return the money to the original senders
        let accountBalances = yield makeAccountBalances(transaction, transfer)
        yield accountBalances.revertDebits()

        log.debug('expired transfer: ' + transferId)

        yield _this.notificationWorker.queueNotifications(transfer, transaction)
      }
    })
  }

  * watch (transfer) {
    // Star the expiry countdown if we're not already watching it
    if (!this.queue.includes(transfer.id)) {
      const now = moment()
      const expiry = moment(transfer.expires_at)
      if (transfer.expires_at && now.isBefore(expiry)) {
        yield this.queue.insert(expiry, transfer.id)

        log.debug('transfer ' + transfer.id +
          ' will expire in ' + expiry.diff(now, 'milliseconds') + 'ms')
      }
    } else if (transfer.state === transferStates.TRANSFER_STATE_EXECUTED ||
      transfer.state === transferStates.TRANSFER_STATE_REJECTED) {
      this.unwatch(transfer.id)
    }
  }

  * processExpiredTransfers () {
    log.debug('checking for transfers to expire')
    const transfersToExpire = this.queue.popBeforeDate(moment())
    for (let id of transfersToExpire) {
      yield this.expireTransfer(id)
    }
  }

  unwatch (transferId) {
    log.debug('unwatch transfer: ' + transferId)
    this.queue.remove(transferId)
  }
}

exports.TransferExpiryMonitor = TransferExpiryMonitor
