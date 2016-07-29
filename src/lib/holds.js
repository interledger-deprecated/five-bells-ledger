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
    return adjustBalance(debit.account, -debit.amount, transaction).then(() => {
      return Promise.all([
        adjustBalance('hold', debit.amount, transaction),
        insertEntryByName(debit.account, transfer.id, transaction)
      ])
    })
  }))
}

function disburseFunds (transfer, transaction) {
  return Promise.all(transfer.credits.map((credit) => {
    return adjustBalance('hold', -credit.amount, transaction).then(() => {
      return Promise.all([
        adjustBalance(credit.account, credit.amount, transaction),
        insertEntryByName(credit.account, transfer.id, transaction)
      ])
    })
  }))
}

function returnHeldFunds (transfer, transaction) {
  return Promise.all(transfer.debits.map((debit) => {
    return adjustBalance('hold', -debit.amount, transaction).then(() => {
      return Promise.all([
        adjustBalance(debit.account, debit.amount, transaction),
        insertEntryByName(debit.account, transfer.id, transaction)
      ])
    })
  }))
}

module.exports = {
  holdFunds,
  disburseFunds,
  returnHeldFunds
}
