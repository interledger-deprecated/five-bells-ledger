'use strict'

const _ = require('lodash')
const transferDictionary = require('five-bells-shared').TransferStateDictionary
const transferStates = transferDictionary.transferStates
const isTransferFinalized = require('./transferUtils').isTransferFinalized
const convertToExternalTransfer = require('../models/converters/transfers')
  .convertToExternalTransfer
const maybeGetFulfillment = require('../models/db/fulfillments').maybeGetFulfillment
const convertToExternalFulfillment = require('../models/converters/fulfillments')
  .convertToExternalFulfillment

class NotificationBroadcaster {
  constructor (log) {
    this.log = log

    // This value is a Map mapping accounts to a Map mapping types to a Set of
    // listeners.
    //
    // { account → { type → [ listener ] } }
    this.listeners = new Map()
  }

  async sendNotifications (transfer, transaction) {
    const affectedAccounts = _([transfer.debits, transfer.credits])
      .flatten().map('account').uniq().value()

    let relatedResources
    // If the transfer is finalized, see if it was finalized by a fulfillment
    if (isTransferFinalized(transfer)) {
      const fulfillment = await maybeGetFulfillment(transfer.id, { transaction })

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
    await this.emitNotification(affectedAccounts, eventName,
      convertToExternalTransfer(transfer), relatedResources)
  }

  async sendMessage (destinationAccount, message) {
    return await this.emitNotification([destinationAccount], 'message.send', message)
  }

  async emitNotification (affectedAccounts, eventType, resource, relatedResources) {
    // Always notify global listeners - as identified by the special "*" account name
    affectedAccounts = affectedAccounts.concat('*')

    const eventTypes = ['*', eventType]
    const eventParts = eventType.split('.')
    for (let i = 1; i < eventParts.length; i++) {
      eventTypes.push(eventParts.slice(0, i).join('.') + '.*')
    }

    const notification = { event: eventType, resource }
    if (relatedResources) notification.related_resources = relatedResources

    this.log.debug('emitting notification:{' + affectedAccounts.join(',') + '}:' + eventType)

    const selectedListeners = new Set()
    for (const account of affectedAccounts) {
      const accountListeners = this.listeners.get(account)

      if (accountListeners) {
        for (const eventType of eventTypes) {
          const typeListeners = accountListeners.get(eventType)

          if (typeListeners) {
            for (const listener of typeListeners) {
              selectedListeners.add(listener)
            }
          }
        }
      }
    }

    for (const listener of selectedListeners) {
      listener(notification)
    }

    return !!selectedListeners.size
  }

  addNotificationListener (accountName, eventType, listener) {
    let accountListeners = this.listeners.get(accountName)
    if (!accountListeners) {
      accountListeners = new Map()
      this.listeners.set(accountName, accountListeners)
    }

    let typeListeners = accountListeners.get(eventType)
    if (!typeListeners) {
      typeListeners = new Set()
      accountListeners.set(eventType, typeListeners)
    }

    typeListeners.add(listener)
  }

  removeNotificationListener (accountName, eventType, listener) {
    const accountListeners = this.listeners.get(accountName)
    if (!accountListeners) return

    const typeListeners = accountListeners.get(eventType)
    if (!typeListeners) return

    typeListeners.delete(listener)

    if (!typeListeners.size) {
      accountListeners.delete(eventType)

      if (!accountListeners.size) {
        this.listeners.delete(accountName)
      }
    }
  }
}

module.exports = NotificationBroadcaster
