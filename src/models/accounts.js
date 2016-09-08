'use strict'
const _ = require('lodash')
const assert = require('assert')
const config = require('../services/config')
const log = require('../services/log').create('accounts')
const notificationBroadcaster = require('../services/notificationBroadcaster')
const db = require('./db/accounts')
const hashPassword = require('five-bells-shared/utils/hashPassword')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const uri = require('../services/uriManager')
const validator = require('../services/validator')
const converters = require('./converters/accounts')

function getPublicData (data) {
  return {
    id: uri.make('account', data.name.toLowerCase()),
    name: data.name
  }
}

function getConnectorData (data) {
  return {
    id: uri.make('account', data.name.toLowerCase()),
    name: data.name,
    connector: data.connector
  }
}

function isRecommendedConnector (data) {
  if (!config.recommendedConnectors) return true
  return config.recommendedConnectors.indexOf(data.name) !== -1
}

function * getConnectors () {
  const accounts = yield db.getConnectorAccounts()
  return accounts.filter(isRecommendedConnector).map(getConnectorData)
}

function * getAccounts () {
  const accounts = yield db.getAccounts()
  return accounts.map(converters.convertToExternalAccount)
}

function * getAccount (name, requestingUser) {
  log.debug('fetching account name ' + name)

  const canExamine = requestingUser &&
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
  const data = canExamine ? converters.convertToExternalAccount(account)
    : getPublicData(account)
  data.ledger = config.getIn(['server', 'base_uri'])
  return data
}

function * setAccount (externalAccount, requestingUser) {
  assert(requestingUser)

  const validationResult = validator.create('Account')(externalAccount)
  if (validationResult.valid !== true) {
    const message = validationResult.schema
      ? 'Body did not match schema ' + validationResult.schema
      : 'Body did not pass validation'
    throw new InvalidBodyError(message, validationResult.errors)
  }
  const account = converters.convertToInternalAccount(externalAccount)

  if (account.password) {
    account.password_hash = (yield hashPassword(account.password)).toString('base64')
    delete account.password
  }

  const allowedKeys = ['name', 'connector', 'password_hash', 'fingerprint',
    'public_key']
  if (!requestingUser.is_admin && !(requestingUser.name === account.name && (
      _.every(_.keys(account), (key) => _.includes(allowedKeys, key))))) {
    throw new UnauthorizedError('Not authorized')
  }
  const existed = yield db.upsertAccount(account)
  log.debug((existed ? 'updated' : 'created') + ' account name ' +
    account.name)
  return {
    account: converters.convertToExternalAccount(account),
    existed: existed
  }
}

function subscribeTransfers (account, requestingUser, listener) {
  assert(requestingUser)
  if (!requestingUser.is_admin && !(requestingUser.name === account)) {
    throw new UnauthorizedError('Not authorized')
  }

  log.info('new ws subscriber for ' + account)
  notificationBroadcaster.addListener('transfer-' + account, listener)

  return () => notificationBroadcaster.removeListener('transfer-' + account, listener)
}

function * insertAccounts (externalAccounts) {
  const accounts = externalAccounts.map(converters.convertToInternalAccount)
  // Hash passwords
  for (let account of accounts) {
    if (account.password) {
      account.password_hash = (yield hashPassword(account.password))
        .toString('base64')
      delete account.password
    }
  }
  yield db.insertAccounts(accounts)
}

function setBalance (name, balance, options) {
  return db.upsertAccount({name, balance}, options && options.transaction)
}

module.exports = {
  getAccounts,
  getConnectors,
  getAccount,
  setAccount,
  setBalance,
  subscribeTransfers,
  insertAccounts
}
