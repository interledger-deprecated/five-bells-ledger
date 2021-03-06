'use strict'
const _ = require('lodash')
const assert = require('assert')
const config = require('../services/config')
const log = require('../services/log').create('accounts')
const db = require('./db/accounts')
const hashPassword = require('five-bells-shared/utils/hashPassword')
const HttpErrors = require('http-errors')
const uri = require('../services/uriManager')
const validator = require('../services/validator')
const converters = require('./converters/accounts')

function getPublicData (data) {
  return {
    id: uri.make('account', data.name.toLowerCase()),
    name: data.name
  }
}

function getConnectors (config) {
  if (!config.recommendedConnectors) return []

  return config.recommendedConnectors.map(name => ({ name })).map(getPublicData)
}

async function verifyConnectors (config) {
  if (!config.recommendedConnectors) return
  for (const connector of config.recommendedConnectors) {
    try {
      await getAccount(connector)
    } catch (err) {
      log.warn('connector account ' + err.name + ': ' + err.message + ': ' + connector)
    }
  }
}

async function getAccounts () {
  const accounts = await db.getAccounts()
  return accounts.map(converters.convertToExternalAccount)
}

async function getAccount (name, requestingUser) {
  log.debug('fetching account name ' + name)

  let canExamine = false
  let account
  if (!requestingUser) { // anonymous request
    account = {id: name, name: name}
  } else { // authenticated request
    canExamine = requestingUser.name === name || requestingUser.is_admin
    account = await db.getAccount(name)
    if (!account) {
      throw new HttpErrors.NotFound('Unknown account')
    } else if (account.is_disabled &&
      (requestingUser && !requestingUser.is_admin)) {
      throw new HttpErrors.Forbidden('This account is disabled')
    }

    // TODO get rid of this when we start using biginteger math everywhere
    account.balance = Number(account.balance).toString()
    delete account.password_hash
  }

  const data = canExamine ? converters.convertToExternalAccount(account)
    : getPublicData(account)
  data.ledger = config.getIn(['server', 'base_uri'])
  return data
}

async function setAccount (externalAccount, requestingUser) {
  assert(requestingUser)

  const validationResult = validator.create('Account')(externalAccount)
  if (validationResult.valid !== true) {
    const message = validationResult.schema
      ? 'Body did not match schema ' + validationResult.schema
      : 'Body did not pass validation'
    throw new HttpErrors.BadRequest(message, validationResult.errors)
  }
  const account = converters.convertToInternalAccount(externalAccount)

  if (account.password) {
    account.password_hash = (await hashPassword(account.password)).toString('base64')
    delete account.password
  }

  const allowedKeys = ['name', 'connector', 'password_hash', 'fingerprint',
    'public_key']
  if (!requestingUser.is_admin && !(requestingUser.name === account.name && (
      _.every(_.keys(account), (key) => _.includes(allowedKeys, key))))) {
    throw new HttpErrors.Forbidden('Not authorized')
  }
  const existed = await db.upsertAccount(account)
  log.debug((existed ? 'updated' : 'created') + ' account name ' +
    account.name)
  return {
    account: converters.convertToExternalAccount(account),
    existed: existed
  }
}

async function insertAccounts (externalAccounts) {
  const accounts = externalAccounts.map(converters.convertToInternalAccount)
  // Hash passwords
  for (let account of accounts) {
    if (account.password) {
      account.password_hash = (await hashPassword(account.password))
        .toString('base64')
      delete account.password
    }
  }
  await db.insertAccounts(accounts)
}

function setBalance (name, balance, options) {
  return db.upsertAccount({name, balance}, options && options.transaction)
}

module.exports = {
  getAccounts,
  getConnectors,
  verifyConnectors,
  getAccount,
  setAccount,
  setBalance,
  insertAccounts
}
