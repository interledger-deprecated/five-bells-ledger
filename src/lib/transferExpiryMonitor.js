'use strict'

const moment = require('moment')
const withSerializableTransaction = require('./db').withSerializableTransaction
const log = require('../services/log').create('expiry monitor')
const holds = require('./holds')
const updateState = require('./updateState')
const ExpiredTransferError = require('../errors/expired-transfer-error')
const getTransfer = require('../models/db/transfers').getTransfer
const updateTransfer = require('../models/db/transfers').updateTransfer
const transferDictionary = require('five-bells-shared').TransferStateDictionary
const isTransferFinalized = require('./transferUtils').isTransferFinalized

const transferStates = transferDictionary.transferStates

class TransferExpiryMonitor {
  constructor (timeQueue, notificationBroadcaster) {
    this.queue = timeQueue
    this.notificationBroadcaster = notificationBroadcaster
  }

  validateNotExpired (transfer) {
    const now = moment()
    if (transfer.expires_at &&
      now.isAfter(transfer.expires_at)) {
      throw new ExpiredTransferError('Cannot modify transfer ' +
        'after expires_at date')
    }
    return now
  }

  async expireTransfer (transferId) {
    const _this = this

    await withSerializableTransaction(async function (transaction) {
      const transfer = await getTransfer(transferId, { transaction })

      if (!transfer) {
        log.error('trying to expire transfer that cannot be found ' +
          'in the database: ' + transferId)
        return
      }

      if (!isTransferFinalized(transfer)) {
        if (transfer.state === transferStates.TRANSFER_STATE_PREPARED) {
          // Return the money to the original senders
          holds.returnHeldFunds(transfer, transaction)
        }
        updateState(transfer, transferStates.TRANSFER_STATE_REJECTED)
        transfer.rejection_reason = 'expired'
        await updateTransfer(transfer, {transaction})

        log.debug('expired transfer: ' + transferId)

        await _this.notificationBroadcaster.sendNotifications(transfer, transaction)
      }
    })
  }

  async watch (transfer) {
    // Start the expiry countdown if we're not already watching it
    if (!this.queue.includes(transfer.id)) {
      const now = moment()
      const expiry = moment(transfer.expires_at)
      if (transfer.expires_at && now.isBefore(expiry)) {
        await this.queue.insert(expiry, transfer.id)

        log.debug('transfer ' + transfer.id +
          ' will expire in ' + expiry.diff(now, 'milliseconds') + 'ms')
      }
    } else if (transfer.state === transferStates.TRANSFER_STATE_EXECUTED ||
      transfer.state === transferStates.TRANSFER_STATE_REJECTED) {
      this.unwatch(transfer.id)
    }
  }

  async processExpiredTransfers () {
    log.debug('checking for transfers to expire')
    const transfersToExpire = this.queue.popBeforeDate(moment())
    for (const id of transfersToExpire) {
      await this.expireTransfer(id)
    }
  }

  unwatch (transferId) {
    log.debug('unwatch transfer: ' + transferId)
    this.queue.remove(transferId)
  }
}

exports.TransferExpiryMonitor = TransferExpiryMonitor
