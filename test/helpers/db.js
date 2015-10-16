'use strict'

const db = require('../../src/services/db')
const Account = require('../../src/models/account').Account
const Transfer = require('../../src/models/transfer').Transfer
const Subscription = require('../../src/models/subscription').Subscription

exports.reset = function * () {
  yield db.sync()
  yield [
    Account.truncate(),
    Transfer.truncate(),
    Subscription.truncate()
  ]
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
