'use strict'

const db = require('./db/subscriptions')
const log = require('../services/log')('subscriptions')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')
const subscriptionUtils = require('../lib/subscriptionUtils')

function * getSubscription (id, requestingUser) {
  log.debug('fetching subscription ID ' + id)
  const subscription = yield db.getSubscription(id)
  if (!subscription) {
    throw new NotFoundError('Unknown subscription ID')
  } else if (!subscriptionUtils.isOwnerOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You may only view subscriptions you own')
  } else {
    return subscription.getDataExternal()
  }
}

function * setSubscription (subscription, requestingUser) {
  if (!subscriptionUtils.isOwnerOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You do not own this account')
  } else if (!subscriptionUtils.isSubjectOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You are not authorized to listen to this account')
  }

  log.debug('updating subscription ID ' + subscription.id)
  log.debug('subscribed ' + subscription.owner + ' at ' + subscription.target)

  let existed
  yield db.transaction(function * (transaction) {
    const duplicate = yield db.getMatchingSubscription(
      subscription, {transaction})
    if (duplicate) {
      throw new UnprocessableEntityError(
        'Subscription with same event, subject, and target already exists')
    }
    existed = yield db.upsertSubscription(subscription, {transaction})
  })

  log.debug('update completed')
  return {
    subscription: subscription.getDataExternal(),
    existed: existed
  }
}

function * deleteSubscription (id, requestingUser) {
  log.debug('deleting subscription ID ' + id)
  yield db.transaction(function * (transaction) {
    const subscription = yield db.getSubscription(id, {transaction})
    if (!subscription) {
      throw new NotFoundError('Unknown subscription ID')
    }
    if (!subscriptionUtils.isOwnerOrAdmin(requestingUser, subscription)) {
      throw new UnauthorizedError('You don\'t have permission to delete this subscription')
    }
    yield db.deleteSubscription(id, {transaction})
  })
}

module.exports = {
  getSubscription,
  setSubscription,
  deleteSubscription
}
