'use strict'

const TABLE_NAME = 'L_ENTRIES'
const _ = require('lodash')
const db = require('./utils')(TABLE_NAME,
  convertToPersistent, convertFromPersistent)
const getTransferId = require('./transfers').getTransferId
const removeAuditFields = require('./audit').removeAuditFields

function convertToPersistent (data) {
  const result = _.cloneDeep(data)
  if (result.id) {
    result.entry_id = result.id
    delete result.id
  }
  if (result.created_at) {
    result.created_dttm = result.created_at
    delete result.created_at
  }
  return _.mapKeys(result, (value, key) => key.toUpperCase())
}

function convertFromPersistent (data) {
  const result = _.mapKeys(_.cloneDeep(data), (value, key) => key.toLowerCase())
  result.id = result.entry_id
  delete result.entry_id
  result.created_at = result.created_dttm
  delete result.created_dttm
  return removeAuditFields(result)
}

function insertEntry (entry, options) {
  return getTransferId(entry.transfer_id, options).then((transferId) => {
    const row = _.assign({}, entry, {transfer_id: transferId})
    return db.insert(row, options && options.transaction)
  })
}

module.exports = {
  insertEntry
}
