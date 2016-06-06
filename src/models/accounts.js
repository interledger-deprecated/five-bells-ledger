'use strict'
const _ = require('lodash')
const assert = require('assert')
const config = require('../services/config')
const log = require('../services/log')('accounts')
const notificationWorker = require('../services/notificationWorker')
const db = require('./db/accounts')
const hashPassword = require('five-bells-shared/utils/hashPassword')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const uri = require('../services/uriManager')
const validator = require('../services/validator')

function getPublicData (data) {
  return {
    id: uri.make('account', data.name.toLowerCase()),
    name: data.name
  }
}

function convertFromExternal (data) {
  // ID is optional on the incoming side
  data = _.cloneDeep(data)
  if (data.id) {
    data.name = uri.parse(data.id, 'account').name.toLowerCase()
    delete data.id
  } else {
    data.name = data.name.toLowerCase()
  }

  if (data.balance) {
    data.balance = Number(data.balance)
  }

  // Passing in a password hash is a potential DoS vector because the hash
  // specifies the number of iterations needed to verify it. So a malicious
  // client could set it to UINT32_MAX and make the server do an insane amount
  // of hashing work.
  //
  // There are other places in the code that should prevent users from setting
  // the hash directly, but it's a good idea to put an extra layer of
  // protection and prevent setting it here.
  if (typeof data.password_hash !== 'undefined') {
    delete data.password_hash
  }

  if (data.minimum_allowed_balance) {
    if (data.minimum_allowed_balance === '-infinity') {
      data.minimum_allowed_balance = Number.NEGATIVE_INFINITY
    } else {
      data.minimum_allowed_balance = Number(data.minimum_allowed_balance)
    }
  }

  return data
}

function convertToExternal (data) {
  data = _.cloneDeep(data)
  data.id = uri.make('account', data.name.toLowerCase())
  data.balance = String(Number(data.balance))

  // Never show any information about credentials
  delete data.password
  delete data.password_hash
  delete data.public_key
  delete data.fingerprint

  if (data.minimum_allowed_balance === Number.NEGATIVE_INFINITY) {
    data.minimum_allowed_balance = '-infinity'
  } else if (data.minimum_allowed_balance) {
    data.minimum_allowed_balance = String(Number(data.minimum_allowed_balance))
  } else {
    data.minimum_allowed_balance = '0'
  }
  if (!data.connector) delete data.connector
  if (!data.is_admin) delete data.is_admin
  return data
}

function getConnectorData (data) {
  return {
    id: uri.make('account', data.name.toLowerCase()),
    name: data.name,
    connector: data.connector
  }
}

function * getAccounts () {
  const accounts = yield db.getAccounts()
  return accounts.map(convertToExternal)
}

function * getConnectors () {
  const accounts = yield db.getConnectorAccounts()
  return accounts.map(getConnectorData)
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
  const data = canExamine ? convertToExternal(account) : getPublicData(account)
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
  const account = convertFromExternal(externalAccount)

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
    account: convertToExternal(account),
    existed: existed
  }
}

function subscribeTransfers (account, requestingUser, listener) {
  assert(requestingUser)
  if (!requestingUser.is_admin && !(requestingUser.name === account)) {
    throw new UnauthorizedError('Not authorized')
  }

  log.info('new ws subscriber for ' + account)
  notificationWorker.addListener('transfer-' + account, listener)

  return () => notificationWorker.removeListener('transfer-' + account, listener)
}

module.exports = {
  getAccounts,
  getConnectors,
  getAccount,
  setAccount,
  subscribeTransfers,
  convertToExternal,
  convertFromExternal
}
