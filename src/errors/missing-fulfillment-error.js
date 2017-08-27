'use strict'

const ExtensibleError = require('extensible-error')

class MissingFulfillmentError extends ExtensibleError {
  constructor (message) {
    super(message)

    this.status = 404
  }
}

module.exports = MissingFulfillmentError
