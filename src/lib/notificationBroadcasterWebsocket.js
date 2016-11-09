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

    let relatedResources
    // If the transfer is finalized, see if it was finalized by a fulfillment
    if (isTransferFinalized(transfer)) {
      const fulfillment = yield maybeGetFulfillment(transfer.id, { transaction })

      if (fulfillment) {
        if (transfer.state === transferStates.TRANSFER_STATE_EXECUTED) {
          relatedResources = {
            execution_condition_fulfillment:
              convertToExternalFulfillment(fulfillment)
          }
        } else if (transfer.state === transferStates.TRANSFER_STATE_REJECTED) {
          relatedResources = {
            cancellation_condition_fulfillment:
              convertToExternalFulfillment(fulfillment)
          }
        }
      }
    }

    const eventName = transfer.state === transferStates.TRANSFER_STATE_PREPARED
      ? 'transfer.create' : 'transfer.update'
    yield this.emitNotification(affectedAccounts, eventName,
      convertToExternalTransfer(transfer), relatedResources)
  }

  * sendMessage (destinationAccount, message) {
    yield this.emitNotification([destinationAccount, '*'], 'message.send', message)
  }

  * emitNotification (affectedAccounts, eventType, resource, relatedResources) {
    const eventTypes = ['*', eventType]
    const eventParts = eventType.split('.')
    for (let i = 1; i < eventParts.length; i++) {
      eventTypes.push(eventParts.slice(0, i).join('.') + '.*')
    }

    const notification = { event: eventType, resource }
    if (relatedResources) notification.related_resources = relatedResources

    this.log.debug('emitting notification:{' + affectedAccounts.join(',') + '}:' + eventType)
    for (const account of affectedAccounts) {
      for (const event of eventTypes) {
        this.emit('notification:' + account + ':' + event, notification)
      }
    }
  }
}

module.exports = NotificationBroadcaster
