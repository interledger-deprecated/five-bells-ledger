'use strict'

const assert = require('assert')
const _ = require('lodash')
const db = require('../../services/db')
const Subscription = require('./subscription').Subscription
const InvalidModificationError = require('five-bells-shared').InvalidModificationError

function * getSubscription (id, options) {
  const subscriptions = yield Subscription.findWhere({id, is_deleted: false}, options)
  return Subscription.fromDatabaseModel(subscriptions[0])
}

function * getMatchingSubscription (subscription, options) {
  const results = yield Subscription.findWhere({
    event: subscription.event,
    subject: subscription.subject,
    target: subscription.target,
    is_deleted: false
  }, options)
  return results.length > 0 ? results[0] : null
}

function * _upsertSubscription (subscription, options) {
  assert(options.transaction)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  const existingSubscription = yield Subscription.findById(
    subscription.id, options)
  const isDeleted = existingSubscription && existingSubscription.is_deleted
  if (isDeleted) {
    throw new InvalidModificationError('This subscription is deleted. Please use a new ID')
  }
  if (existingSubscription) {
    existingSubscription.setData(subscription)
    yield existingSubscription.save(options)
  } else {
    yield Subscription.create(subscription, options)
  }
  return Boolean(existingSubscription)
}

function * upsertSubscription (subscription, options) {
  if (options && options.transaction) {
    return yield _upsertSubscription(subscription, options)
  } else {
    let result
    yield db.transaction(function * (transaction) {
      result = yield _upsertSubscription(subscription,
        _.assign({}, options || {}, {transaction}))
    })
    return result
  }
}

function * deleteSubscription (id, options) {
  assert(options.transaction)
  const existingSubscription = yield getSubscription(id, options)
  if (existingSubscription) {
    existingSubscription.setData({is_deleted: true})
    return yield existingSubscription.save(options)
  }
}

module.exports = {
  getSubscription,
  getMatchingSubscription,
  upsertSubscription,
  deleteSubscription,
  transaction: db.transaction.bind(db)
}
