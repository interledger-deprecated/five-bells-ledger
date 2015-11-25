'use strict'

const UnprocessableEntityError = require('five-bells-shared').UnprocessableEntityError

class ExpiredTransferError extends UnprocessableEntityError {
  constructor (message, accountIdentifier) {
    super(message)
    this.accountIdentifier = accountIdentifier
  }

  * handler (ctx, log) {
    log.warn('Expired Transfer: ' + this.message)
    ctx.status = 422
    ctx.body = {
      id: this.name,
      message: this.message,
      owner: this.accountIdentifier
    }
  }
}

module.exports = ExpiredTransferError
