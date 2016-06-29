'use strict'

const db = require('../../src/lib/db')
const insertTransfers = require('../../src/models/transfers').insertTransfers
const insertAccounts = require('../../src/models/accounts').insertAccounts
const setBalance = require('../../src/models/accounts').setBalance
const insertFulfillments = require('../../src/models/db/fulfillments')
  .insertFulfillments

// Only run migrations once during tests
let init = false
exports.init = function * () {
  if (init) {
    return
  }
  yield db.dropTables()
  yield db.createTables()
  yield db.readLookupTables()
  init = true
}

exports.clean = function * () {
  yield db.truncateTables()
}

exports.setHoldBalance = function * (balance) {
  yield setBalance('hold', balance)
}

exports.addAccounts = function * (accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error('Requires an array of accounts, got ' + accounts)
  }

  yield insertAccounts(accounts)
}

exports.addTransfers = function * (transfers) {
  if (!Array.isArray(transfers)) {
    throw new Error('Requires an array of transfers, got ' + transfers)
  }
  yield insertTransfers(transfers)
}

exports.addFulfillments = function * (fulfillments) {
  if (!Array.isArray(fulfillments)) {
    throw new Error('Requires an array of fulfillments, got ' + fulfillments)
  }
  yield insertFulfillments(fulfillments)
}
