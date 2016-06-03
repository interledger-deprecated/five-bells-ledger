'use strict'

const _ = require('lodash')
const assert = require('assert')
const db = require('../../services/db')
const knex = require('../../lib/knex').knex
const config = require('../../services/config')

const TABLE_NAME = 'L_ACCOUNTS'

function convertFromPersistent (data) {
  data = _.cloneDeep(data)
  data = _.mapKeys(data, (value, key) => key.toLowerCase())
  delete data.account_id
  // some databases store booleans as 0 and 1, and knex does not convert
  data.is_disabled = Boolean(data.is_disabled)
  data.is_admin = Boolean(data.is_admin)
  // oracle has balance stored properly, but knex returns it with a small
  // rounding error, possibly a bug in knex; using toFixed as workaround
  data.balance = Number(Number(data.balance).toFixed(config.amount.scale))
  if (data.minimum_allowed_balance === null) {
    data.minimum_allowed_balance = Number.NEGATIVE_INFINITY
  } else if (data.minimum_allowed_balance) {
    data.minimum_allowed_balance = Number(data.minimum_allowed_balance)
  } else {
    data.minimum_allowed_balance = 0
  }
  delete data.created_at
  delete data.updated_at
  return data
}

function convertToPersistent (data) {
  data = _.cloneDeep(data)
  if (data.balance) {
    data.balance = Number(Number(data.balance).toFixed(config.amount.scale))
  }
  if (data.minimum_allowed_balance) {
    if (data.minimum_allowed_balance === Number.NEGATIVE_INFINITY) {
      data.minimum_allowed_balance = null
    } else {
      data.minimum_allowed_balance = Number(data.minimum_allowed_balance)
    }
  }
  return _.mapKeys(data, (value, key) => key.toUpperCase())
}

function getTransaction (options) {
  return !options ? knex : (!options.transaction ? knex : options.transaction)
}

function * getAccounts (options) {
  return getTransaction(options)
    .from(TABLE_NAME).select()
    .then((results) => results.map(convertFromPersistent))
}

function * getConnectorAccounts (options) {
  return (yield getAccounts(options))
    .filter((account) => account.connector)
    .map(convertFromPersistent)
}

function getAccountByKey (key, value, options) {
  return getTransaction(options)
    .from(TABLE_NAME).select().where(key, value)
    .then((results) => results.map(convertFromPersistent))
    .then((results) => {
      if (results.length === 1) {
        return results[0]
      } else if (results.length === 0) {
        return null
      } else {
        assert(false, 'Multiple accounts have the same ' + key)
      }
    })
}

function getAccount (name, options) {
  return getAccountByKey('NAME', name, options)
}

function getAccountByFingerprint (fingerprint, options) {
  return getAccountByKey('FINGERPRINT', fingerprint, options)
}

function * updateAccount (account, options) {
  return getTransaction(options)(TABLE_NAME)
    .update(convertToPersistent(account))
    .where('NAME', account.name)
}

function * insertAccount (account, options) {
  return getTransaction(options)
    .insert(convertToPersistent(account))
    .into(TABLE_NAME)
}

function * insertAccounts (accounts, options) {
  return getTransaction(options)
    .insert(accounts.map(convertToPersistent))
    .into(TABLE_NAME)
}

function * _upsertAccount (account, options) {
  assert(options.transaction)
  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  const existingAccount = yield getAccount(account.name, options)
  if (existingAccount) {
    yield updateAccount(account, options)
  } else {
    yield insertAccount(account, options)
  }
  return Boolean(existingAccount)
}

function * upsertAccount (account, options) {
  if (options && options.transaction) {
    return yield _upsertAccount(account, options)
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
  getAccountByFingerprint,
  upsertAccount,
  insertAccounts
}
