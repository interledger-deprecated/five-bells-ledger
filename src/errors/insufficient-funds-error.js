'use strict'

const ExtensibleError = require('extensible-error')

class InsufficientFundsError extends ExtensibleError {
  constructor (message, accountIdentifier) {
    super(message)

    this.status = 422
    this.accountIdentifier = accountIdentifier
  }
}

module.exports = InsufficientFundsError
