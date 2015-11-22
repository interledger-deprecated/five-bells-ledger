'use strict'

const _ = require('lodash')
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')
const InsufficientFundsError = require('../errors/insufficient-funds-error')
const log = require('../services/log')('account balances')
const Account = require('../models/account').Account
const EntryGroup = require('../models/entry-group').EntryGroup

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
    const accountObj = yield Account.findById(account, { transaction: this.transaction })

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

// Accounts is the object returned by the _getAccountBalances function
AccountBalances.prototype._applyDebits = function * (accounts) {
  const transaction = this.transaction
  const holdAccount = yield this._holdAccount()
  const group = yield EntryGroup.create({}, {transaction})
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
    account.balance -= debitAccount.totalAmount
    holdAccount.balance += debitAccount.totalAmount
    yield this._saveAccount(account, group)
  }
  yield this._saveAccount(holdAccount, group)
}

// Accounts is the object returned by the _getAccountBalances function
AccountBalances.prototype._applyCredits = function * (accounts) {
  const transaction = this.transaction
  const holdAccount = yield this._holdAccount()
  const group = yield EntryGroup.create({}, {transaction})
  for (let recipient of Object.keys(accounts)) {
    const creditAccount = accounts[recipient]

    const account = yield Account.findById(recipient, { transaction })
    log.debug('recipient ' + recipient + ' balance: ' + account.balance +
      ' -> ' + (account.balance + creditAccount.totalAmount))
    account.balance += creditAccount.totalAmount
    holdAccount.balance -= creditAccount.totalAmount
    yield this._saveAccount(account, group)
  }
  yield this._saveAccount(holdAccount, group)
}

AccountBalances.prototype._saveAccount = function * (account, group) {
  yield account.createEntry({
    entry_group: group.id,
    transfer_id: this.transfer.id
  }, {transaction: this.transaction})
  yield account.save({transaction: this.transaction})
}

AccountBalances.prototype._holdAccount = function * () {
  const holdAccount = yield Account.findById('hold', {transaction: this.transaction})
  return holdAccount ||
    (yield Account.create({
      id: 'hold',
      name: 'hold',
      balance: '0'
    }, {transaction: this.transaction}))
}

module.exports = function * (transaction, transfer) {
  const accountBalances = new AccountBalances(transaction, transfer)
  yield accountBalances._setup()
  return accountBalances
}
