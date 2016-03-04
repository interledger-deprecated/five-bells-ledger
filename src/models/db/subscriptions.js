'use strict'

const assert = require('assert')
const _ = require('lodash')
const db = require('../../services/db')
const Subscription = require('./subscription').Subscription

function * getSubscription (id, options) {
  return yield Subscription.findById(id, options)
}

function * getMatchingSubscription (subscription, options) {
  const results = yield Subscription.findWhere({
    event: subscription.event,
    subject: subscription.subject,
    target: subscription.target
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
  yield Subscription.destroy(_.assign({}, options, {where: {id: id}}))
}

module.exports = {
  getSubscription,
  getMatchingSubscription,
  upsertSubscription,
  deleteSubscription,
  transaction: db.transaction.bind(db)
}
