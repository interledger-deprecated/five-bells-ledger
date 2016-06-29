'use strict'

const _ = require('lodash')
const EventEmitter = require('events').EventEmitter
const transferDictionary = require('five-bells-shared').TransferStateDictionary
const transferStates = transferDictionary.transferStates

class NotificationBroadcaster extends EventEmitter {
  constructor (log, Fulfillment, config) {
    super()
    this.log = log
    this.Fulfillment = Fulfillment
    this.config = config
  }

  * sendNotifications (transfer, transaction) {
    const affectedAccounts = _([transfer.debits, transfer.credits])
      .flatten().pluck('account').value()
    affectedAccounts.push('*')

    // Prepare notification for websocket subscribers
    const notificationBody = {
      resource: transfer.getDataExternal()
    }

    // If the transfer is finalized, see if it was finalized by a fulfillment
    let fulfillment
    if (transfer.isFinalized()) {
      fulfillment = yield this.Fulfillment.findByTransfer(transfer.id, { transaction })

      if (fulfillment) {
        if (transfer.state === transferStates.TRANSFER_STATE_EXECUTED) {
          notificationBody.related_resources = {
            execution_condition_fulfillment: fulfillment.getDataExternal()
          }
        } else if (transfer.state === transferStates.TRANSFER_STATE_REJECTED) {
          notificationBody.related_resources = {
            cancellation_condition_fulfillment: fulfillment.getDataExternal()
          }
        }
      }
    }

    this.log.debug('emitting transfer-{' + affectedAccounts.join(',') + '}')
    for (let account of affectedAccounts) {
      this.emit('transfer-' + account, notificationBody)
    }
  }

}

module.exports = NotificationBroadcaster
