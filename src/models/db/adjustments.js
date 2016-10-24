'use strict'

const _ = require('lodash')
const assert = require('assert')
const TABLE_NAME = 'L_TRANSFER_ADJUSTMENTS'
const getAccountId = require('./accounts').getAccountId
const getAccountById = require('./accounts').getAccountById
const db = require('./utils')()

function isNil (x) {
  return x === null || x === undefined
}

function convertFromPersistentAdjustment (data, options) {
  return getAccountById(data.ACCOUNT_ID, options).then((account) => {
    return _.omitBy({
      account: account.name,
      amount: Number(data.AMOUNT).toString(),
      authorized: Boolean(data.IS_AUTHORIZED) || null,
      rejected: Boolean(data.IS_REJECTED) || null,
      rejection_message: data.REJECTION_MESSAGE,
      memo: data.MEMO ? JSON.parse(data.MEMO) : null
    }, isNil)
  })
}

function convertFromPersistent (rows, options) {
  const debits = Promise.all(rows.filter((row) => row.DEBIT_CREDIT === 'debit')
    .map((debit) => convertFromPersistentAdjustment(debit, options)))
  const credits = Promise.all(rows.filter((row) => row.DEBIT_CREDIT === 'credit')
    .map((credit) => convertFromPersistentAdjustment(credit, options)))
  return Promise.all([debits, credits]).then((results) => {
    if (results[0].length === 0 && results[1].length === 0) {
      return {}
    }
    return {
      debits: _.sortBy(results[0], (adjustment) => adjustment.account),
      credits: _.sortBy(results[1], (adjustment) => adjustment.account)
    }
  })
}

function convertToPersistentAdjustment (transferId, type, data, options) {
  return getAccountId(data.account, options).then((accountId) => {
    return _.omitBy({
      TRANSFER_ID: transferId,
      ACCOUNT_ID: accountId,
      DEBIT_CREDIT: type,
      AMOUNT: data.amount,
      IS_AUTHORIZED: isNil(data.authorized) ? null : Number(data.authorized),
      IS_REJECTED: isNil(data.rejected) ? null : Number(data.rejected),
      REJECTION_MESSAGE: data.rejection_message,
      MEMO: data.memo ? JSON.stringify(data.memo) : null
    }, (x) => isNil(x))
  })
}

function convertToPersistent (data, options) {
  const debits = Promise.all(data.debits.map((debit) =>
    convertToPersistentAdjustment(data._id, 'debit', debit, options)))
  const credits = Promise.all(data.credits.map((credit) =>
    convertToPersistentAdjustment(data._id, 'credit', credit, options)))
  return Promise.all([debits, credits]).then((results) =>
    results[0].concat(results[1]))
}

function getAdjustments (transferId, options) {
  return db.getTransaction(options).from(TABLE_NAME).select()
    .where({TRANSFER_ID: transferId}).then((rows) => {
      return convertFromPersistent(rows, options)
    })
}

function insertAdjustments (transfer, options) {
  return convertToPersistent(transfer, options).then((rows) => {
    const transaction = db.getTransaction(options)
    return Promise.all(
      rows.map((row) => transaction.into(TABLE_NAME).insert(row)))
  })
}

function _upsertAdjustment (persistentAdjustment, transaction) {
  assert(transaction, 'transaction is required for upsert')
  const where = {
    TRANSFER_ID: persistentAdjustment.TRANSFER_ID,
    ACCOUNT_ID: persistentAdjustment.ACCOUNT_ID,
    DEBIT_CREDIT: persistentAdjustment.DEBIT_CREDIT
  }
  return transaction.from(TABLE_NAME)
    .select().where(where).then((rows) => {
      if (rows.length > 0) {
        return transaction.into(TABLE_NAME).update(persistentAdjustment)
          .where(where)
      } else {
        return transaction.into(TABLE_NAME).insert(persistentAdjustment)
      }
    })
}

function upsertAdjustment (persistentAdjustment, options) {
  if (options && options.transaction) {
    return _upsertAdjustment(persistentAdjustment, options.transaction)
  } else {
    return db.withTransaction((transaction) =>
      _upsertAdjustment(persistentAdjustment, transaction))
  }
}

function upsertAdjustments (transfer, options) {
  return convertToPersistent(transfer, options).then((rows) => {
    return Promise.all(rows.map((row) => upsertAdjustment(row, options)))
  })
}

module.exports = {
  getAdjustments,
  insertAdjustments,
  upsertAdjustments
}
