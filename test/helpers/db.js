'use strict'

const Account = require('../../models/account').Account
const Transfer = require('../../models/transfer').Transfer
const Subscription = require('../../models/subscription').Subscription

exports.reset = function () {
  return [
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
