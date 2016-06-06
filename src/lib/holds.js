'use strict'

const InsufficientFundsError = require('../errors/insufficient-funds-error')

function adjustBalance (account, amount, transaction) {
  const updateSQL = 'UPDATE "L_ACCOUNTS" SET "BALANCE" = "BALANCE" + ? WHERE "NAME" = ?'
  /* eslint-disable handle-callback-err */
  return transaction.raw(updateSQL, [amount, account]).catch((error) => {
    throw new InsufficientFundsError('Sender has insufficient funds.', account)
  })
  /* eslint-enable */
}

function insertEntry (account, transferID, transaction) {
  return transaction.select('ACCOUNT_ID')
    .from('L_ACCOUNTS').where('NAME', account)
    .then((rows) => {
      const entry = {
        transfer_id: transferID,
        account: rows[0].ACCOUNT_ID
      }
      return transaction.insert(entry).into('entries')
    })
}

function holdFunds (transfer, transaction) {
  return Promise.all(transfer.debits.map((debit) => {
    return Promise.all([
      adjustBalance(debit.account, -debit.amount, transaction),
      adjustBalance('hold', debit.amount, transaction),
      insertEntry(debit.account, transfer.id, transaction)
    ])
  }))
}

function disburseFunds (transfer, transaction) {
  return Promise.all(transfer.credits.map((credit) => {
    return Promise.all([
      adjustBalance('hold', -credit.amount, transaction),
      adjustBalance(credit.account, credit.amount, transaction),
      insertEntry(credit.account, transfer.id, transaction)
    ])
  }))
}

function returnHeldFunds (transfer, transaction) {
  return Promise.all(transfer.debits.map((debit) => {
    return Promise.all([
      adjustBalance('hold', -debit.amount, transaction),
      adjustBalance(debit.account, debit.amount, transaction),
      insertEntry(debit.account, transfer.id, transaction)
    ])
  }))
}

module.exports = {
  holdFunds,
  disburseFunds,
  returnHeldFunds
}
