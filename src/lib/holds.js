'use strict'

const InsufficientFundsError = require('../errors/insufficient-funds-error')
const accounts = require('../models/db/accounts')
const entries = require('../models/db/entries')

function adjustBalance (accountName, amount, transaction) {
  /* eslint-disable handle-callback-err */
  return accounts.adjustBalance(accountName, amount, {transaction})
  .catch((error) => {
    // 40001 is a postgres error code meaning the database could not complete the transaction
    // because this would interfere with other concurrent transactions
    // letting this type of errors through so they can trigger a retry at the src/lib/db.js level
    if (error.code === '40001') {
      throw error
    }
    throw new InsufficientFundsError(
      'Sender has insufficient funds.', accountName)
  })
  /* eslint-enable */
}

function insertEntryByName (accountName, transferId, transaction) {
  return accounts.getAccountId(accountName, {transaction}).then((accountId) => {
    const entry = {
      transfer_id: transferId,
      account_id: accountId
    }
    return entries.insertEntry(entry, {transaction})
  })
}

function holdFunds (transfer, transaction) {
  return Promise.all(transfer.debits.map((debit) => {
    return Promise.all([
      adjustBalance(debit.account, -debit.amount, transaction),
      adjustBalance('hold', debit.amount, transaction),
      insertEntryByName(debit.account, transfer.id, transaction)
    ])
  }))
}

function disburseFunds (transfer, transaction) {
  return Promise.all(transfer.credits.map((credit) => {
    return Promise.all([
      adjustBalance('hold', -credit.amount, transaction),
      adjustBalance(credit.account, credit.amount, transaction),
      insertEntryByName(credit.account, transfer.id, transaction)
    ])
  }))
}

function returnHeldFunds (transfer, transaction) {
  return Promise.all(transfer.debits.map((debit) => {
    return Promise.all([
      adjustBalance('hold', -debit.amount, transaction),
      adjustBalance(debit.account, debit.amount, transaction),
      insertEntryByName(debit.account, transfer.id, transaction)
    ])
  }))
}

module.exports = {
  holdFunds,
  disburseFunds,
  returnHeldFunds
}
