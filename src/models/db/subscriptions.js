'use strict'

const TABLE_NAME = 'L_SUBSCRIPTIONS'
const _ = require('lodash')
const assert = require('assert')
const db = require('./utils')(TABLE_NAME,
  convertToPersistent, convertFromPersistent)
const withTransaction = require('../../lib/db').withTransaction

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

function * getSubscription (id, options) {
  const where = options && options.includeDeleted ? {SUBSCRIPTION_ID: id}
    : {SUBSCRIPTION_ID: id, IS_DELETED: false}
  return db.selectOne(where, options && options.transaction)
}

function * getMatchingSubscription (subscription, options) {
  return db.selectOne({
    EVENT: subscription.event,
    SUBJECT: subscription.subject,
    TARGET: subscription.target,
    IS_DELETED: false
  }, options && options.transaction)
}

function * getAffectedSubscriptions (affectedAccountUris, options) {
  return db.getTransaction(options).from(TABLE_NAME)
    .whereIn('SUBJECT', affectedAccountUris)
    .whereIn('EVENT', ['transfer.update', 'transfer.*', '*'])
    .where('IS_DELETED', false)
    .select().then((results) => results.map(convertFromPersistent))
}

function * updateSubscription (subscription, options) {
  return db.update(subscription, {SUBSCRIPTION_ID: subscription.id},
    options && options.transaction)
}

function * insertSubscriptions (subscriptions, options) {
  return db.insertAll(subscriptions, options && options.transaction)
}

function * upsertSubscription (subscription, options) {
  return db.upsert(subscription, {SUBSCRIPTION_ID: subscription.id},
    options && options.transaction)
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
  withTransaction
}
