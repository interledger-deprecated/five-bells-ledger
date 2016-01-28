'use strict'

const db = require('../../services/db')
const Transfer = require('./transfer').Transfer

function * getTransfer (id, options) {
  return (yield Transfer.findById(id, options))
}

function * upsertTransfer (transfer, options) {
  yield Transfer.upsert(transfer, options)
}

module.exports = {
  getTransfer,
  upsertTransfer,
  transaction: db.transaction.bind(db)
}
