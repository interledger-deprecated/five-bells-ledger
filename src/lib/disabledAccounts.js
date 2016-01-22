'use strict'

const _ = require('lodash')
const Account = require('../models/db/account').Account
const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')

function * validateNoDisabledAccounts (transaction, transfer) {
  const accounts = _.uniq(_.map(transfer.debits.concat(transfer.credits), (creditOrDebit) => {
    return creditOrDebit.account
  }))

  for (const account of accounts) {
    const accountObj = yield Account.findByName(account, { transaction: transaction })
    if (accountObj === null) {
      throw new UnprocessableEntityError('Account `' + account + '` does not exist.')
    }
    if (accountObj.is_disabled) {
      throw new UnprocessableEntityError('Account `' + account + '` is disabled.')
    }
  }
}

module.exports = validateNoDisabledAccounts
