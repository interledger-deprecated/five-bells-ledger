'use strict'

const db = require('../../src/lib/db')
const insertTransfers = require('../../src/models/transfers').insertTransfers
const insertAccounts = require('../../src/models/accounts').insertAccounts
const setBalance = require('../../src/models/accounts').setBalance
const insertSubscriptions = require('../../src/models/subscriptions')
  .insertSubscriptions
const insertNotification = require('../../src/models/db/notifications')
  .insertNotification
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

exports.addSubscriptions = function * (subscriptions) {
  if (!Array.isArray(subscriptions)) {
    throw new Error('Requires an array of subscriptions, got ' + subscriptions)
  }
  yield insertSubscriptions(subscriptions)
}

exports.addNotifications = function * (notifications) {
  if (!Array.isArray(notifications)) {
    throw new Error('Requires an array of notifications, got ' + notifications)
  }
  for (let i = 0; i < notifications.length; i++) {
    yield insertNotification(notifications[i])
  }
}

exports.addFulfillments = function * (fulfillments) {
  if (!Array.isArray(fulfillments)) {
    throw new Error('Requires an array of fulfillments, got ' + fulfillments)
  }
  yield insertFulfillments(fulfillments)
}
