'use strict'

const knex = require('../../src/lib/knex').knex
const knexConfig = require('../../src/lib/knex').config
const createTables = require('../../src/lib/db').createTables
const Account = require('../../src/models/db/account').Account
const Transfer = require('../../src/models/db/transfer').Transfer
const Fulfillment = require('../../src/models/db/conditionFulfillment').ConditionFulfillment

const hashPassword = require('five-bells-shared/utils/hashPassword')

const tables = [
  'accounts',
  'fulfillments',
  'entries',
  'transfers'
]

const migrationTables = [
  'migrations',
  'migrations_lock'
]

// Only run migrations once during tests
let init = false
exports.init = function * () {
  if (init) {
    return
  }
  for (let tableName of tables.concat(migrationTables)) {
    yield knex.schema.dropTableIfExists(tableName).then()
  }

  yield createTables(knex, knexConfig)
  init = true
}

exports.clean = function * () {
  for (let t of tables) {
    yield knex(t).truncate().then()
  }
}

exports.setHoldBalance = function * (balance) {
  yield knex('accounts').where('name', 'hold').update({balance})
}

exports.addAccounts = function * (accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error('Requires an array of accounts, got ' + accounts)
  }

  // Hash passwords
  const accountModels = accounts.map(Account.fromDataExternal.bind(Account))
  for (let account of accountModels) {
    if (account.password) {
      account.password_hash = (yield hashPassword(account.password)).toString('base64')
      delete account.password
    }
  }

  yield Account.bulkCreate(accountModels)
}

exports.addTransfers = function * (transfers) {
  if (!Array.isArray(transfers)) {
    throw new Error('Requires an array of transfers, got ' + transfers)
  }
  yield Transfer.bulkCreateExternal(transfers)
}

exports.addFulfillments = function * (fulfillments) {
  if (!Array.isArray(fulfillments)) {
    throw new Error('Requires an array of fulfillments, got ' + fulfillments)
  }
  for (let i = 0; i < fulfillments.length; i++) {
    yield Fulfillment.create(fulfillments[i])
  }
}
