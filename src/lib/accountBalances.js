'use strict'

const _ = require('lodash')
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')
const InsufficientFundsError = require('../errors/insufficient-funds-error')
const log = require('../services/log')('account balances')
const Account = require('../models/db/account').Account

function AccountBalances (transaction, transfer) {
  this.transaction = transaction
  this.transfer = transfer
  this._debits = null
  this._credits = null
}

AccountBalances.prototype._setup = function * () {
  this._debits = yield this._getAccountBalances(this.transfer.debits)
  this._credits = yield this._getAccountBalances(this.transfer.credits)
}

AccountBalances.prototype.applyDebits = function * () { yield this._applyDebits(this._debits) }
AccountBalances.prototype.applyCredits = function * () { yield this._applyCredits(this._credits) }
AccountBalances.prototype.revertDebits = function * () { yield this._applyCredits(this._debits) }

AccountBalances.prototype._getAccountBalances = function * (creditsOrDebits) {
  let accounts = _.groupBy(creditsOrDebits, function (creditOrDebit) {
    return creditOrDebit.account
  })

  for (let account of Object.keys(accounts)) {
    const amounts = _.pluck(accounts[account], 'amount')
    const accountObj = yield Account.findByName(account, { transaction: this.transaction })

    if (accountObj === null) {
      throw new UnprocessableEntityError(
        'Account `' + account + '` does not exist.')
    }

    accounts[account] = {
      balance: +accountObj.balance,
      totalAmount: +_.sum(_.map(amounts, parseFloat)),
      minimumAllowedBalance: accountObj.minimum_allowed_balance
    }
  }
  return accounts
}

// Accounts is the object returned by the _getAccountBalances function
AccountBalances.prototype._applyDebits = function * (accounts) {
  const transaction = this.transaction
  const holdAccount = yield this._holdAccount()
  for (let sender of Object.keys(accounts)) {
    const debitAccount = accounts[sender]

    // Check senders' balances
    if (debitAccount.balance - debitAccount.totalAmount < debitAccount.minimumAllowedBalance) {
      throw new InsufficientFundsError('Sender has insufficient funds.',
        sender)
    }

    // Take money out of senders' accounts
    const account = yield Account.findByName(sender, { transaction })
    log.debug('sender ' + sender + ' balance: ' + account.balance +
      ' -> ' + (account.balance - debitAccount.totalAmount))
    account.balance -= debitAccount.totalAmount
    holdAccount.balance += debitAccount.totalAmount
    yield this._saveAccount(account)
  }
  yield this._saveAccount(holdAccount)
}

// Accounts is the object returned by the _getAccountBalances function
AccountBalances.prototype._applyCredits = function * (accounts) {
  const transaction = this.transaction
  const holdAccount = yield this._holdAccount()
  for (let recipient of Object.keys(accounts)) {
    const creditAccount = accounts[recipient]

    const account = yield Account.findByName(recipient, { transaction })
    log.debug('recipient ' + recipient + ' balance: ' + account.balance +
      ' -> ' + (account.balance + creditAccount.totalAmount))
    account.balance += creditAccount.totalAmount
    holdAccount.balance -= creditAccount.totalAmount
    yield this._saveAccount(account)
  }
  yield this._saveAccount(holdAccount)
}

AccountBalances.prototype._saveAccount = function * (account) {
  yield account.createEntry({
    transfer_id: this.transfer.id
  }, {transaction: this.transaction})
  yield account.save({transaction: this.transaction})
}

AccountBalances.prototype._holdAccount = function * () {
  const holdAccount = yield Account.findByName('hold', {transaction: this.transaction})
  if (!holdAccount) {
    throw new Error('Missing "hold" account')
  }
  return holdAccount
}

module.exports = function * (transaction, transfer) {
  const accountBalances = new AccountBalances(transaction, transfer)
  yield accountBalances._setup()
  return accountBalances
}
