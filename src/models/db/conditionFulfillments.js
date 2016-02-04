'use strict'

const assert = require('assert')
const _ = require('lodash')
const ConditionFulfillment = require('./conditionFulfillment').ConditionFulfillment
const db = require('../../services/db')

function * getFulfillment (transferId, options) {
  return (yield ConditionFulfillment.findByTransfer(transferId, options))
}

function * _upsertFulfillment (fulfillment, options) {
  assert(options.transaction)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  const existingFulfillment = yield ConditionFulfillment.findByTransfer(fulfillment.getData().transfer_id, options)
  if (existingFulfillment) {
    ConditionFulfillment.upsert(existingFulfillment, options)
  } else {
    yield ConditionFulfillment.createExternal(fulfillment, options)
  }
  return Boolean(existingFulfillment)
}

function * upsertFulfillment (fulfillment, options) {
  if (options && options.transaction) {
    return (yield _upsertFulfillment(fulfillment, options))
  } else {
    let result
    yield db.transaction(function * (transaction) {
      result = yield _upsertFulfillment(fulfillment,
        _.assign({}, options || {}, {transaction}))
    })
    return result
  }
}

module.exports = {
  getFulfillment,
  upsertFulfillment
}
