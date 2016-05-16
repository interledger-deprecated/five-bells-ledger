'use strict'

const log = require('../services/log')('subscriptions')
const uri = require('../services/uriManager')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const Notification = require('./db/notification').Notification
const Transfer = require('./db/transfer').Transfer
const Fulfillment = require('./db/conditionFulfillment').ConditionFulfillment
const subscriptions = require('./db/subscriptions')
const subscriptionUtils = require('../lib/subscriptionUtils')
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates

function * getNotification (subscriptionId, notificationId, requestingUser) {
  log.debug('fetching notification ID ' + notificationId)
  const notification = yield Notification.findById(notificationId)
  if (!notification) {
    throw new NotFoundError('Unknown notification ID')
  } else if (!notification.subscription_id) {
    throw new NotFoundError('Unknown notification ID')
  } else if (notification.subscription_id !== subscriptionId) {
    throw new NotFoundError('Unknown subscription ID')
  }

  const subscription = yield subscriptions.getSubscription(notification.subscription_id)
  if (!subscription) {
    throw new NotFoundError('Unknown subscription')
  } else if (!subscriptionUtils.isOwnerOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You do not own this subscription')
  } else {
    const transfer = yield Transfer.findById(notification.transfer_id)
    const fulfillment = yield Fulfillment.findByTransfer(transfer.id)
    const subscriptionURI = uri.make('subscription', subscription.id)
    const notificationBody = {
      id: subscriptionURI + '/notifications/' + notification.id,
      subscription: subscriptionURI,
      event: 'transfer.update',
      resource: transfer.getDataExternal()
    }
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
    return notificationBody
  }
}

module.exports = {
  getNotification
}
