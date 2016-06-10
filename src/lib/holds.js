'use strict'

const InsufficientFundsError = require('../errors/insufficient-funds-error')
const accounts = require('../models/db/accounts')
const entries = require('../models/db/entries')

function adjustBalance (accountName, amount, transaction) {
  /* eslint-disable handle-callback-err */
  return accounts.adjustBalance(accountName, amount, {transaction})
  .catch((error) => {
    throw new InsufficientFundsError(
      'Sender has insufficient funds.', accountName)
  })
  /* eslint-enable */
}

function insertEntryByName (accountName, transferID, transaction) {
  return accounts.getAccount(accountName, {transaction}).then((account) => {
    const entry = {
      transfer_id: transferID,
      account: account.id
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
