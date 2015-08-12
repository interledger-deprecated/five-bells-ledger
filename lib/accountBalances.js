'use strict'

const _ = require('lodash')
const UnprocessableEntityError = require('@ripple/five-bells-shared/errors/unprocessable-entity-error')
const InsufficientFundsError = require('../errors/insufficient-funds-error')
const log = require('../services/log')('account balances')

exports.calculate = function * getAccountBalances (tr, creditsOrDebits) {
  let accounts = _.groupBy(creditsOrDebits, function (creditOrDebit) {
    return creditOrDebit.account
  })

  for (let account of Object.keys(accounts)) {
    const amounts = _.pluck(accounts[account], 'amount')
    const accountObj = yield tr.get(['accounts', account])

    if (typeof accountObj === 'undefined') {
      throw new UnprocessableEntityError(
        'Account `' + account + '` does not exist.')
    }

    accounts[account] = {
      balance: +accountObj.balance,
      totalAmount: +_.sum(_.map(amounts, parseFloat))
    }
  }

  return accounts
}

// Accounts is the object returned by the getAccountBalances function
exports.applyDebits = function * applyDebits (tr, accounts) {
  for (let sender of Object.keys(accounts)) {
    const debitAccount = accounts[sender]

    // Check senders' balances
    if (debitAccount.balance < debitAccount.totalAmount) {
      throw new InsufficientFundsError('Sender has insufficient funds.',
        sender)
    }

    // Take money out of senders' accounts
    log.debug('sender ' + sender + ' balance: ' + debitAccount.balance +
      ' -> ' + (debitAccount.balance - debitAccount.totalAmount))
    tr.put(['accounts', sender, 'balance'],
      debitAccount.balance - debitAccount.totalAmount)
  }
}

// Accounts is the object returned by the getAccountBalances function
exports.applyCredits = function * applyCredits (tr, accounts) {
  for (let recipient of Object.keys(accounts)) {
    const creditAccount = accounts[recipient]

    log.debug('recipient ' + recipient + ' balance: ' + creditAccount.balance +
      ' -> ' + (creditAccount.balance + creditAccount.totalAmount))

    tr.put(['accounts', recipient, 'balance'],
      creditAccount.balance + creditAccount.totalAmount)
  }
}
