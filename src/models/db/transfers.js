'use strict'

const _ = require('lodash')
const assert = require('assert')
const db = require('../../services/db')
const Transfer = require('./transfer').Transfer

function * getTransfer (id, options) {
  return yield Transfer.findById(id, options)
}

function * _upsertTransfer (transfer, options) {
  assert(options.transaction)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  const existingTransfer = yield Transfer.findById(transfer.id, options)
  if (existingTransfer) {
    existingTransfer.setData(transfer)
    yield existingTransfer.save(options)
  } else {
    yield Transfer.create(transfer, options)
  }
  return Boolean(existingTransfer)
}

function * upsertTransfer (transfer, options) {
  if (options && options.transaction) {
    return yield _upsertTransfer(transfer, options)
  } else {
    let result
    yield db.transaction(function * (transaction) {
      result = yield _upsertTransfer(transfer,
        _.assign({}, options || {}, {transaction}))
    })
    return result
  }
}

module.exports = {
  getTransfer,
  upsertTransfer,
  transaction: db.transaction.bind(db)
}
