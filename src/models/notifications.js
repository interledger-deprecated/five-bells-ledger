'use strict'

const log = require('../services/log').create('subscriptions')
const uri = require('../services/uriManager')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const getTransfer = require('./db/transfers').getTransfer
const getFulfillment = require('./db/fulfillments').getFulfillment
const subscriptions = require('./db/subscriptions')
const subscriptionUtils = require('../lib/subscriptionUtils')
const transferDictionary = require('five-bells-shared').TransferStateDictionary
const convertToExternalTransfer = require('./converters/transfers')
  .convertToExternalTransfer
const convertToExternalFulfillment = require('./converters/fulfillments')
  .convertToExternalFulfillment
const db = require('./db/notifications')

const transferStates = transferDictionary.transferStates

function * getNotification (subscriptionId, notificationId, requestingUser) {
  log.debug('fetching notification ID ' + notificationId)
  const notification = yield db.getNotification(notificationId)
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
    const transfer = yield getTransfer(notification.transfer_id)
    const fulfillment = yield getFulfillment(transfer.id)
    const subscriptionURI = uri.make('subscription', subscription.id)
    const notificationBody = {
      id: subscriptionURI + '/notifications/' + notification.id,
      subscription: subscriptionURI,
      event: 'transfer.update',
      resource: convertToExternalTransfer(transfer)
    }
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
    return notificationBody
  }
}

module.exports = {
  getNotification
}
