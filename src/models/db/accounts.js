'use strict'

const Account = require('./account').Account
const db = require('../../services/db')

function * getAccounts () {
  return (yield Account.findAll())
}

function * getConnectorAccounts () {
  return (yield Account.findAll({
    where: { connector: { $ne: null } }
  }))
}

function * getAccount (name) {
  return (yield Account.findByName(name))
}

function * upsertAccount (account) {
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  let existingAccount
  yield db.transaction(function * (transaction) {
    existingAccount = yield Account.findByName(account.name, { transaction })
    if (existingAccount) {
      existingAccount.setDataExternal(account)
      yield existingAccount.save({ transaction })
    } else {
      yield Account.createExternal(account, { transaction })
    }
  })
  return Boolean(existingAccount)
}

module.exports = {
  getAccounts,
  getConnectorAccounts,
  getAccount,
  upsertAccount
}
