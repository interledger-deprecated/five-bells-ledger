'use strict'

const db = require('../../src/lib/db')
const insertTransfers = require('../../src/models/transfers').insertTransfers
const insertAccounts = require('../../src/models/accounts').insertAccounts
const setBalance = require('../../src/models/accounts').setBalance
const insertFulfillments = require('../../src/models/db/fulfillments')
  .insertFulfillments

// Only run migrations once during tests
let init = false
exports.init = async function () {
  if (init) {
    return
  }
  await db.dropTables()
  await db.createTables()
  await db.readLookupTables()
  init = true
}

exports.clean = async function () {
  await db.truncateTables()
}

exports.setHoldBalance = async function (balance) {
  await setBalance('hold', balance)
}

exports.addAccounts = async function (accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error('Requires an array of accounts, got ' + accounts)
  }

  await insertAccounts(accounts)
}

exports.addTransfers = async function (transfers) {
  if (!Array.isArray(transfers)) {
    throw new Error('Requires an array of transfers, got ' + transfers)
  }
  await insertTransfers(transfers)
}

exports.addFulfillments = async function (fulfillments) {
  if (!Array.isArray(fulfillments)) {
    throw new Error('Requires an array of fulfillments, got ' + fulfillments)
  }
  await insertFulfillments(fulfillments)
}
