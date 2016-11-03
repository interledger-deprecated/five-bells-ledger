'use strict'

const _ = require('lodash')
const getAccount = require('../models/db/accounts').getAccount
const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')

function * validateNoDisabledAccounts (transaction, transfer) {
  const accounts = _.uniq([transfer.debit_account, transfer.credit_account])

  for (const account of accounts) {
    const accountObj = yield getAccount(account, { transaction: transaction })
    if (accountObj === null) {
      throw new UnprocessableEntityError('Account `' + account + '` does not exist.')
    }
    if (accountObj.is_disabled) {
      throw new UnprocessableEntityError('Account `' + account + '` is disabled.')
    }
  }
}

module.exports = validateNoDisabledAccounts
