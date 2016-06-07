'use strict'

const _ = require('lodash')
const assert = require('assert')
const db = require('../../services/db')
const knex = require('../../lib/knex').knex
const InvalidModificationError = require('five-bells-shared').InvalidModificationError

const TABLE_NAME = 'L_SUBSCRIPTIONS'

function convertFromPersistent (data) {
  const result = _.mapKeys(_.cloneDeep(data), (value, key) => key.toLowerCase())
  result.id = result.subscription_id
  delete result.subscription_id
  delete result.created_at
  delete result.updated_at
  return result
}

function convertToPersistent (data) {
  const result = _.cloneDeep(data)
  result.subscription_id = result.id
  delete result.id
  return _.mapKeys(result, (value, key) => key.toUpperCase())
}

function getTransaction (options) {
  return !options ? knex : (!options.transaction ? knex : options.transaction)
}

function getSubscriptionWhere (where, options) {
  return getTransaction(options)
    .from(TABLE_NAME).select().where(where)
    .then((results) => {
      if (results.length === 1) {
        return convertFromPersistent(results[0])
      } else if (results.length === 0) {
        return null
      } else {
        assert(false, 'Multiple subscriptions match ' + JSON.stringify(where))
      }
    })
}

function * getSubscription (id, options) {
  const where = options && options.includeDeleted ? {SUBSCRIPTION_ID: id}
    : {SUBSCRIPTION_ID: id, IS_DELETED: false}
  return getSubscriptionWhere(where, options)
}

function * getMatchingSubscription (subscription, options) {
  return getSubscriptionWhere({
    EVENT: subscription.event,
    SUBJECT: subscription.subject,
    TARGET: subscription.target,
    IS_DELETED: false
  }, options)
}

function * getAffectedSubscriptions (affectedAccountUris, options) {
  return getTransaction(options).from(TABLE_NAME)
    .whereIn('SUBJECT', affectedAccountUris)
    .whereIn('EVENT', ['transfer.update', 'transfer.*', '*'])
    .where('IS_DELETED', false)
    .select().then((results) => results.map(convertFromPersistent))
}

function * updateSubscription (subscription, options) {
  return getTransaction(options)(TABLE_NAME)
    .update(convertToPersistent(subscription))
    .where('SUBSCRIPTION_ID', subscription.id)
}

function * insertSubscription (subscription, options) {
  return getTransaction(options)
    .insert(convertToPersistent(subscription))
    .into(TABLE_NAME)
}

function * insertSubscriptions (subscriptions, options) {
  return getTransaction(options)
    .insert(subscriptions.map(convertToPersistent))
    .into(TABLE_NAME)
}

function * _upsertSubscription (subscription, options) {
  assert(options.transaction)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  const existingSubscription = yield getSubscription(subscription.id,
    _.assign({}, options, {includeDeleted: true}))
  const isDeleted = existingSubscription && existingSubscription.is_deleted
  if (isDeleted) {
    throw new InvalidModificationError('This subscription is deleted. Please use a new ID')
  }
  if (existingSubscription) {
    yield updateSubscription(subscription, options)
  } else {
    yield insertSubscription(subscription, options)
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
    const updatedSubscription = _.assign({}, existingSubscription,
      {is_deleted: true})
    return yield updateSubscription(updatedSubscription, options)
  }
}

module.exports = {
  getSubscription,
  getMatchingSubscription,
  getAffectedSubscriptions,
  upsertSubscription,
  deleteSubscription,
  insertSubscriptions,
  transaction: db.transaction.bind(db)
}
