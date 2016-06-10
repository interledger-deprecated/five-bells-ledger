'use strict'

const _ = require('lodash')
const db = require('./utils')('L_FULFILLMENTS',
  convertToPersistent, convertFromPersistent)

function convertFromPersistent (data) {
  const result = _.mapKeys(_.cloneDeep(data), (value, key) => key.toLowerCase())
  result.id = result.fulfillment_id
  delete result.fulfillment_id
  delete result.created_at
  delete result.updated_at
  return result
}

function convertToPersistent (data) {
  const result = _.cloneDeep(data)
  if (result.id) {
    result.fulfillment_id = result.id
    delete result.id
  }
  return _.mapKeys(result, (value, key) => key.toUpperCase())
}

function * insertFulfillments (fulfillments, options) {
  return db.insertAll(fulfillments, options && options.transaction)
}

function * getFulfillment (transferId, options) {
  return db.selectOne({TRANSFER_ID: transferId}, options && options.transaction)
}

function * upsertFulfillment (fulfillment, options) {
  const where = {FULFILLMENT_ID: fulfillment.id}
  return db.upsert(fulfillment, where, options && options.transaction)
}

module.exports = {
  getFulfillment,
  insertFulfillments,
  upsertFulfillment
}
