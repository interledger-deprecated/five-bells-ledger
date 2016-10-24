'use strict'

const _ = require('lodash')
const EventEmitter = require('events').EventEmitter
const transferDictionary = require('five-bells-shared').TransferStateDictionary
const transferStates = transferDictionary.transferStates
const isTransferFinalized = require('./transferUtils').isTransferFinalized
const convertToExternalTransfer = require('../models/converters/transfers')
  .convertToExternalTransfer
const maybeGetFulfillment = require('../models/db/fulfillments').maybeGetFulfillment
const convertToExternalFulfillment = require('../models/converters/fulfillments')
  .convertToExternalFulfillment

class NotificationBroadcaster extends EventEmitter {
  constructor (log) {
    super()
    this.log = log
  }

  * sendNotifications (transfer, transaction) {
    const affectedAccounts = _([transfer.debits, transfer.credits])
      .flatten().map('account').value()
    affectedAccounts.push('*')

    // Prepare notification for websocket subscribers
    const notificationBody = {
      type: 'transfer',
      resource: convertToExternalTransfer(transfer)
    }

    // If the transfer is finalized, see if it was finalized by a fulfillment
    let fulfillment
    if (isTransferFinalized(transfer)) {
      fulfillment = yield maybeGetFulfillment(transfer.id, { transaction })

      if (fulfillment) {
        if (transfer.state === transferStates.TRANSFER_STATE_EXECUTED) {
          notificationBody.related_resources = {
            execution_condition_fulfillment:
              convertToExternalFulfillment(fulfillment)
          }
        } else if (transfer.state === transferStates.TRANSFER_STATE_REJECTED) {
          notificationBody.related_resources = {
            cancellation_condition_fulfillment:
              convertToExternalFulfillment(fulfillment)
          }
        }
      }
    }

    this.log.debug('emitting notification-{' + affectedAccounts.join(',') + '}')
    for (let account of affectedAccounts) {
      this.emit('notification-' + account, notificationBody)
    }
  }

  * sendMessage (destinationAccount, message) {
    const affectedAccounts = [destinationAccount, '*']
    for (let account of affectedAccounts) {
      this.emit('notification-' + account, {
        type: 'message',
        resource: message
      })
    }
  }
}

module.exports = NotificationBroadcaster
