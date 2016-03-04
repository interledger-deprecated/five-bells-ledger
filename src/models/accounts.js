'use strict'
const assert = require('assert')
const config = require('../services/config')
const log = require('../services/log')('accounts')
const db = require('./db/accounts')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')

function * getAccounts () {
  const accounts = yield db.getAccounts()
  return accounts.map((account) => account.getDataExternal())
}

function * getConnectors () {
  const accounts = yield db.getConnectorAccounts()
  return accounts.map((account) => account.getDataConnector())
}

function * getAccount (name, requestingUser) {
  log.debug('fetching account name ' + name)

  const can_examine = requestingUser &&
    (requestingUser.name === name || requestingUser.is_admin)
  const account = yield db.getAccount(name)
  if (!account) {
    throw new NotFoundError('Unknown account')
  } else if (account.is_disabled &&
      (requestingUser && !requestingUser.is_admin)) {
    throw new UnauthorizedError('This account is disabled')
  }

  // TODO get rid of this when we start using biginteger math everywhere
  account.balance = Number(account.balance).toString()
  delete account.password_hash
  const data = can_examine
    ? account.getDataExternal() : account.getDataPublic()
  data.ledger = config.getIn(['server', 'base_uri'])
  return data
}

function * setAccount (account, requestingUser) {
  assert(requestingUser.is_admin)
  const existed = yield db.upsertAccount(account)
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
