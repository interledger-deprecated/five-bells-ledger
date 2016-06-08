'use strict'

const _ = require('lodash')
const assert = require('assert')
const db = require('../../services/db')
const knex = require('../../lib/knex').knex

const TABLE_NAME = 'L_TRANSFERS'

function convertFromPersistent (data) {
  data = _.cloneDeep(data)
  data = _.mapKeys(data, (value, key) => key.toLowerCase())
  data.id = data.transfer_id
  delete data.transfer_id
  delete data.created_at
  delete data.updated_at
  data.credits = JSON.parse(data.credits)
  data.debits = JSON.parse(data.debits)
  data.additional_info = JSON.parse(data.additional_info)
  if (data.expires_at) {
    data.expires_at = new Date(data.expires_at)
  }
  if (data.proposed_at) {
    data.proposed_at = new Date(data.proposed_at)
  }
  if (data.prepared_at) {
    data.prepared_at = new Date(data.prepared_at)
  }
  if (data.executed_at) {
    data.executed_at = new Date(data.executed_at)
  }
  if (data.rejected_at) {
    data.rejected_at = new Date(data.rejected_at)
  }
  data = _.omit(data, _.isNull)
  return data
}

function convertToPersistent (data) {
  data = _.cloneDeep(data)
  data.credits = JSON.stringify(data.credits)
  data.debits = JSON.stringify(data.debits)
  data.additional_info = JSON.stringify(data.additional_info)
  if (data.proposed_at) {
    data.proposed_at = new Date(data.proposed_at)
  }
  if (data.prepared_at) {
    data.prepared_at = new Date(data.prepared_at)
  }
  if (data.executed_at) {
    data.executed_at = new Date(data.executed_at)
  }
  if (data.rejected_at) {
    data.rejected_at = new Date(data.rejected_at)
  }
  data.TRANSFER_ID = data.id
  delete data.id
  return _.mapKeys(data, (value, key) => key.toUpperCase())
}

function getTransaction (options) {
  return !options ? knex : (!options.transaction ? knex : options.transaction)
}

function * getTransfer (id, options) {
  return getTransaction(options)
    .from(TABLE_NAME).select().where('TRANSFER_ID', id)
    .then((results) => {
      if (results.length === 1) {
        return convertFromPersistent(results[0])
      } else if (results.length === 0) {
        return null
      } else {
        assert(false, 'Multiple transfers have the same ID')
      }
    })
}

function * updateTransfer (transfer, options) {
  return getTransaction(options)(TABLE_NAME)
    .update(convertToPersistent(transfer))
    .where('TRANSFER_ID', transfer.id)
}

function * insertTransfer (transfer, options) {
  return getTransaction(options)
    .insert(convertToPersistent(transfer))
    .into(TABLE_NAME)
}

function * insertTransfers (transfers, options) {
  return getTransaction(options)
    .insert(transfers.map(convertToPersistent))
    .into(TABLE_NAME)
}

function * _upsertTransfer (transfer, options) {
  assert(options.transaction)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  const existingTransfer = yield getTransfer(transfer.id, options)
  if (existingTransfer) {
    yield updateTransfer(transfer, options)
  } else {
    yield insertTransfer(transfer, options)
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
  updateTransfer,
  insertTransfers,
  transaction: db.transaction.bind(db),
  client: db.client
}
