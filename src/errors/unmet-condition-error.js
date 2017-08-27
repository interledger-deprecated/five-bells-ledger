'use strict'

const ExtensibleError = require('extensible-error')

class UnmetConditionError extends ExtensibleError {
  constructor (message) {
    super(message)

    this.status = 422
  }
}

module.exports = UnmetConditionError
