'use strict'

const db = require('../services/db')
const log = require('../services/log')('subscriptions')
const uri = require('../services/uriManager')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const Subscription = require('./db/subscription').Subscription
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')

function isOwnerOrAdmin (requestingUser, subscription) {
  const requestOwner = uri.make('account', requestingUser.name)
  return requestOwner === subscription.owner || requestingUser.is_admin
}

function isSubjectOrAdmin (requestingUser, subscription) {
  const requestOwner = uri.make('account', requestingUser.name)
  return requestOwner === subscription.subject || requestingUser.is_admin
}

/**
 * Store a subscription in the database.
 *
 * @param {Object} subscription Subscription
 * @returns {void}
 */
function * storeSubscription (subscription) {
  yield db.transaction(function *(transaction) {
    // Check prerequisites

    const duplicateSubscription = yield Subscription.findOne({
      where: {
        event: subscription.event,
        subject: subscription.subject,
        target: subscription.target
      }
    }, { transaction })

    if (duplicateSubscription) {
      throw new UnprocessableEntityError('Subscription with same event, subject, and target already exists')
    }
    // Store subscription in database
    // TODO: Who to subscribe to should be defined by a separate `subject`
    //       field.
    yield Subscription.upsert(subscription, { transaction })
  })
}

function * getSubscription (id, requestingUser) {
  log.debug('fetching subscription ID ' + id)
  const subscription = yield Subscription.findById(id)
  if (!subscription) {
    throw new NotFoundError('Unknown subscription ID')
  } else if (!isOwnerOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You may only view subscriptions you own')
  } else {
    return subscription.getDataExternal()
  }
}

function * setSubscription (subscription, requestingUser) {
  if (!isOwnerOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You do not own this account')
  } else if (!isSubjectOrAdmin(requestingUser, subscription)) {
    throw new UnauthorizedError('You are not authorized to listen to this account')
  }

  log.debug('updating subscription ID ' + subscription.id)
  log.debug('subscribed ' + subscription.owner + ' at ' + subscription.target)

  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  let existed = yield Subscription.findById(subscription.id)
  yield * storeSubscription(subscription)

  log.debug('update completed')

  return {
    subscription: subscription.getDataExternal(),
    existed: existed
  }
}

function * deleteSubscription (id, requestingUser) {
  log.debug('deleting subscription ID ' + id)

  yield db.transaction(function *(transaction) {
    const subscription = yield Subscription.findById(id, { transaction })

    if (!subscription) {
      throw new NotFoundError('Unknown subscription ID')
    }
    if (!isOwnerOrAdmin(requestingUser, subscription)) {
      throw new UnauthorizedError('You don\'t have permission to delete this subscription')
    }

    subscription.destroy({ transaction })
  })
}

module.exports = {
  getSubscription,
  setSubscription,
  deleteSubscription
}
