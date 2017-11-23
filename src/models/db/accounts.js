'use strict'

const TABLE_NAME = 'L_ACCOUNTS'
const _ = require('lodash')
const db = require('./utils')(TABLE_NAME,
  convertToPersistent, convertFromPersistent)
const config = require('../../services/config')
const knex = require('../../lib/knex').knex
const removeAuditFields = require('./audit').removeAuditFields

function convertFromPersistent (data) {
  data = _.cloneDeep(data)
  data = _.mapKeys(data, (value, key) => key.toLowerCase())
  delete data.account_id
  // some databases store booleans as 0 and 1, and knex does not convert
  data.is_disabled = Boolean(data.is_disabled)
  data.is_admin = Boolean(data.is_admin)
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
  return removeAuditFields(data)
}

function convertToPersistent (data) {
  data = _.cloneDeep(data)
  if (data.balance) {
    data.balance = Number(Number(data.balance).toFixed(config.amount.scale))
  }
  if (data.minimum_allowed_balance) {
    if (data.minimum_allowed_balance === Number.NEGATIVE_INFINITY) {
      // A null value in the db column means the balance can go negative without limit
      data.minimum_allowed_balance = null
    } else {
      data.minimum_allowed_balance = Number(data.minimum_allowed_balance)
    }
  } // Otherwise the db defaults minimum_allowed_balance to 0
  if (!_.isUndefined(data.is_admin)) {
    data.is_admin = Number(data.is_admin)
  }
  if (!_.isUndefined(data.is_disabled)) {
    data.is_disabled = Number(data.is_disabled)
  }
  return _.mapKeys(data, (value, key) => key.toUpperCase())
}

function getAccounts (options) {
  return db.select({}, options && options.transaction)
}

function getAccount (name, options) {
  return db.selectOne({NAME: name}, options && options.transaction)
}

function getAccountByFingerprint (fingerprint, options) {
  return db.selectOne({FINGERPRINT: fingerprint}, options && options.transaction)
}

function getAccountById (id, options) {
  return db.selectOne({ACCOUNT_ID: id}, options && options.transaction)
}

function getAccountId (name, options) {
  const transaction = options && options.transaction
  return (transaction || knex).from(TABLE_NAME).select()
    .where('NAME', name).then((accounts) => {
      return accounts.length === 1 ? accounts[0].ACCOUNT_ID : null
    })
}

function adjustBalance (name, amount, options) {
  const updateSQL =
    'UPDATE "L_ACCOUNTS" SET "BALANCE" = "BALANCE" + ? WHERE "NAME" = ?'
  return db.getTransaction(options).raw(updateSQL, [amount, name])
}

function updateAccount (account, options) {
  return db.update(account, {ACCOUNT_ID: account.id},
    options && options.transaction)
}

function insertAccounts (accounts, options) {
  return db.insertAll(accounts, options && options.transaction)
}

function upsertAccount (account, options) {
  return db.upsert(account, {NAME: account.name},
    options && options.transaction)
}

module.exports = {
  getAccounts,
  getAccountId,
  getAccount,
  getAccountByFingerprint,
  getAccountById,
  adjustBalance,
  updateAccount,
  upsertAccount,
  insertAccounts
}
