'use strict'

const _ = require('lodash')
const Account = require('../models/account').Account
const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')

function * hasDisabledAccounts (transaction, transfer) {
  let accounts = _.groupBy(transfer.debits.concat(transfer.credits), function (creditOrDebit) {
    return creditOrDebit.account
  })

  for (let account of Object.keys(accounts)) {
    const accountObj = yield Account.findByName(account, { transaction: transaction })
    if (accountObj === null) {
      throw new UnprocessableEntityError('Account `' + account + '` does not exist.')
    }
    if (accountObj.is_disabled) {
      throw new UnprocessableEntityError('Account `' + account + '` is disabled.')
    }
  }
}

module.exports = hasDisabledAccounts
