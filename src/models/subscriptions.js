'use strict'

const db = require('./db/subscriptions')
const log = require('../services/log')('subscriptions')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const subscriptionUtils = require('../lib/subscriptionUtils')
const converters = require('./converters/subscriptions')
const validator = require('../services/validator')

function * getSubscription (id, requestingUser) {
  log.debug('fetching subscription ID ' + id)
  const subscription = yield db.getSubscription(id)
  if (!subscription) {
    throw new NotFoundError('Unknown subscription ID')
  } else if (!subscriptionUtils.isOwnerOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You may only view subscriptions you own')
  } else {
    return converters.convertToExternalSubscription(subscription)
  }
}

function * setSubscription (externalSubscription, requestingUser) {
  const validationResult = validator
    .create('Subscription')(externalSubscription)
  if (validationResult.valid !== true) {
    const message = validationResult.schema
      ? 'Body did not match schema ' + validationResult.schema
      : 'Body did not pass validation'
    throw new InvalidBodyError(message, validationResult.errors)
  }
  const subscription = converters.convertToInternalSubscription(
    externalSubscription)

  if (!subscriptionUtils.isOwnerOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You do not own this account')
  } else if (!subscriptionUtils.isSubjectOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You are not authorized to listen to this account')
  }

  log.debug('updating subscription ID ' + subscription.id)
  log.debug('subscribed ' + subscription.owner + ' at ' + subscription.target)

  let existed
  yield db.withTransaction(function * (transaction) {
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
    subscription: converters.convertToExternalSubscription(subscription),
    existed: existed
  }
}

function * deleteSubscription (id, requestingUser) {
  log.debug('deleting subscription ID ' + id)
  yield db.withTransaction(function * (transaction) {
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

function * insertSubscriptions (externalSubscriptions) {
  yield db.insertSubscriptions(externalSubscriptions.map(
    converters.convertToInternalSubscription))
}

module.exports = {
  getSubscription,
  setSubscription,
  deleteSubscription,
  insertSubscriptions
}
