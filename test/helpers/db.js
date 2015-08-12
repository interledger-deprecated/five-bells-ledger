'use strict'

const db = require('../../services/db')
const Account = require('../../models/account').Account
const Transfer = require('../../models/transfer').Transfer

exports.reset = function () {
  return db.remove()
}

exports.addAccounts = function * (accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error('Requires an array of accounts, got ' + accounts)
  }
  yield db.transaction(function * (tr) {
    for (let accountData of accounts) {
      let account = Account.fromData(accountData)
      account.save(tr)
    }
  })
}

exports.addTransfers = function * (transfers) {
  if (!Array.isArray(transfers)) {
    throw new Error('Requires an array of transfers, got ' + transfers)
  }
  yield db.transaction(function * (tr) {
    for (let transferData of transfers) {
      let transfer = Transfer.fromData(transferData)
      transfer.save(tr)
    }
  })
}

exports.getAccount = function * (id, tr) {
  return Account.fromDataRaw(yield db.get(['accounts', id]))
}
