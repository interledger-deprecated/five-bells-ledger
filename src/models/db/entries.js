'use strict'

const TABLE_NAME = 'L_ENTRIES'
const _ = require('lodash')
const db = require('./utils')(TABLE_NAME,
  convertToPersistent, convertFromPersistent)

function convertToPersistent (data) {
  const result = _.cloneDeep(data)
  result.balance = Number(result.balance)
  result.entry_id = result.id
  delete result.id
  return _.mapKeys(result, (value, key) => key.toUpperCase())
}

function convertFromPersistent (data) {
  const result = _.mapKeys(_.cloneDeep(data), (value, key) => key.toLowerCase())
  result.id = result.entry_id
  delete result.entry_id
  return result
}

function * insertEntry (entry, options) {
  return db.insert(entry, options && options.transaction)
}

module.exports = {
  insertEntry
}
