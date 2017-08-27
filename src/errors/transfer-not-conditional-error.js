'use strict'

const ExtensibleError = require('extensible-error')

class TransferNotConditionalError extends ExtensibleError {
  constructor (message) {
    super(message)

    this.status = 422
  }
}

module.exports = TransferNotConditionalError
