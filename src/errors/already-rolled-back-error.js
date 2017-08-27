'use strict'

const ExtensibleError = require('extensible-error')

class AlreadyRolledBackError extends ExtensibleError {
  constructor (message) {
    super(message)

    this.status = 422
  }
}

module.exports = AlreadyRolledBackError
