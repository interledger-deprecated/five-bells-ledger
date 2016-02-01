'use strict'

const assert = require('assert')
const _ = require('lodash')
const Account = require('./account').Account
const db = require('../../services/db')

function * getAccounts (options) {
  return (yield Account.findAll(options))
}

function * getConnectorAccounts (options) {
  return (yield Account.findAll(_.assign({}, options, {
    where: { connector: { $ne: null } }
  })))
}

function * getAccount (name, options) {
  return (yield Account.findByName(name, options))
}

function * _upsertAccount (account, options) {
  assert(options.transaction)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  const existingAccount = yield Account.findByName(account.name, options)
  if (existingAccount) {
    existingAccount.setDataExternal(account)
    yield existingAccount.save(options)
  } else {
    yield Account.createExternal(account, options)
  }
  return Boolean(existingAccount)
}

function * upsertAccount (account, options) {
  if (options && options.transaction) {
    return (yield _upsertAccount(account, options))
  } else {
    let result
    yield db.transaction(function * (transaction) {
      result = yield _upsertAccount(account,
        _.assign({}, options || {}, {transaction}))
    })
    return result
  }
}

module.exports = {
  getAccounts,
  getConnectorAccounts,
  getAccount,
  upsertAccount
}
