'use strict'

const _ = require('lodash')
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')
const InsufficientFundsError = require('../errors/insufficient-funds-error')
const log = require('../services/log')('account balances')
const Account = require('../models/account').Account

exports.calculate = function * getAccountBalances (tr, creditsOrDebits) {
  let accounts = _.groupBy(creditsOrDebits, function (creditOrDebit) {
    return creditOrDebit.account
  })

  for (let account of Object.keys(accounts)) {
    const amounts = _.pluck(accounts[account], 'amount')
    const accountObj = yield Account.findById(account, { transaction: tr })

    if (accountObj === null) {
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
exports.applyDebits = function * applyDebits (transaction, accounts) {
  for (let sender of Object.keys(accounts)) {
    const debitAccount = accounts[sender]

    // Check senders' balances
    if (debitAccount.balance < debitAccount.totalAmount) {
      throw new InsufficientFundsError('Sender has insufficient funds.',
        sender)
    }

    // Take money out of senders' accounts
    const account = yield Account.findById(sender, { transaction })
    log.debug('sender ' + sender + ' balance: ' + account.balance +
      ' -> ' + (account.balance - debitAccount.totalAmount))
    account.balance = account.balance - debitAccount.totalAmount
    yield account.save({ transaction })
  }
}

// Accounts is the object returned by the getAccountBalances function
exports.applyCredits = function * applyCredits (transaction, accounts) {
  for (let recipient of Object.keys(accounts)) {
    const creditAccount = accounts[recipient]

    const account = yield Account.findById(recipient, { transaction })
    log.debug('recipient ' + recipient + ' balance: ' + account.balance +
      ' -> ' + (account.balance + creditAccount.totalAmount))
    account.balance = account.balance + creditAccount.totalAmount
    yield account.save({ transaction })
  }
}
