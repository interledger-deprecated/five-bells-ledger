'use strict'

const ExtensibleError = require('extensible-error')

class TransferNotFoundError extends ExtensibleError {
  constructor (message) {
    super(message)

    this.status = 404
  }
}

module.exports = TransferNotFoundError
