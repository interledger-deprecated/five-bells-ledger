'use strict'

const db = require('../../src/services/db')
const Account = require('../../src/models/db/account').Account
const Transfer = require('../../src/models/transfer').Transfer
const Subscription = require('../../src/models/subscription').Subscription

exports.reset = function * () {
  yield db.sync()
  return db.transaction(function * (transaction) {
    if (db.getDialect() === 'mysql') {
      yield db.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })
    }
    yield db.truncate({ transaction, cascade: true })
    if (db.getDialect() === 'mysql') {
      yield db.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })
    }
  })
}

exports.addAccounts = function * (accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error('Requires an array of accounts, got ' + accounts)
  }
  yield Account.bulkCreateExternal(accounts)
}

exports.addTransfers = function * (transfers) {
  if (!Array.isArray(transfers)) {
    throw new Error('Requires an array of transfers, got ' + transfers)
  }
  yield Transfer.bulkCreateExternal(transfers)
}

exports.addSubscriptions = function * (subscriptions) {
  if (!Array.isArray(subscriptions)) {
    throw new Error('Requires an array of subscriptions, got ' + subscriptions)
  }
  yield Subscription.bulkCreateExternal(subscriptions)
}
