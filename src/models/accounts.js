'use strict'
const assert = require('assert')
const db = require('../services/db')
const config = require('../services/config')
const log = require('../services/log')('accounts')
const Account = require('./db/account').Account
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')

function * getAccounts () {
  const accounts = yield Account.findAll()
  return accounts.map(account => account.getDataExternal())
}

function * getConnectors () {
  const accounts = yield Account.findAll({
    where: { connector: { $ne: null } }
  })
  return accounts.map(account => account.getDataConnector())
}

function * getAccount (name, requestingUser) {
  log.debug('fetching account name ' + name)

  const can_examine = requestingUser &&
    (requestingUser.name === name || requestingUser.is_admin)
  const account = yield Account.findByName(name)
  if (!account) {
    throw new NotFoundError('Unknown account')
  } else if (account.is_disabled &&
      (requestingUser && !requestingUser.is_admin)) {
    throw new UnauthorizedError('This account is disabled')
  }

  // TODO get rid of this when we start using biginteger math everywhere
  account.balance = '' + account.balance
  delete account.password_hash
  const data = can_examine
    ? account.getDataExternal() : account.getDataPublic()
  data.ledger = config.server.base_uri
  return data
}

function * setAccount (account, requestingUser) {
  assert(requestingUser.is_admin)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  let existed
  yield db.transaction(function * (transaction) {
    existed = yield Account.findByName(account.name, { transaction })
    if (existed) {
      existed.setDataExternal(account)
      yield existed.save({ transaction })
    } else {
      yield Account.createExternal(account, { transaction })
    }
  })

  log.debug((existed ? 'updated' : 'created') + ' account name ' +
    account.name)

  return {
    account: account.getDataExternal(),
    existed: existed
  }
}

module.exports = {
  getAccounts,
  getConnectors,
  getAccount,
  setAccount
}
