'use strict'

const InsufficientFundsError = require('../errors/insufficient-funds-error')
const accounts = require('../models/db/accounts')
const entries = require('../models/db/entries')
const BigNumber = require('bignumber.js')

const HOLD_ACCOUNT = 'hold'

function adjustBalance (accountName, amount, transaction) {
  /* eslint-disable handle-callback-err */
  return accounts.adjustBalance(accountName, amount, {transaction})
  .catch((error) => {
    throw new InsufficientFundsError(
      'Account has insufficient funds:' + accountName)
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
  return Promise.all([
    adjustBalance(transfer.debit_account, -transfer.amount, transaction),
    adjustBalance(HOLD_ACCOUNT, transfer.amount, transaction),
    insertEntryByName(transfer.debit_account, transfer.id, transaction)
  ])
}

function disburseFunds (transfer, transaction) {
  return Promise.all([
    adjustBalance(HOLD_ACCOUNT, -transfer.amount, transaction),
    adjustBalance(transfer.credit_account, transfer.amount, transaction),
    insertEntryByName(transfer.credit_account, transfer.id, transaction)
  ])
}

function returnHeldFunds (transfer, transaction) {
  return Promise.all([
    adjustBalance(HOLD_ACCOUNT, -transfer.amount, transaction),
    adjustBalance(transfer.debit_account, transfer.amount, transaction),
    insertEntryByName(transfer.debit_account, transfer.id, transaction)
  ])
}

module.exports = {
  holdFunds,
  disburseFunds,
  returnHeldFunds
}
