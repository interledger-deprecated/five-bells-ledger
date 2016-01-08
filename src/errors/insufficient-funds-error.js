'use strict'

const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')

class InsufficientFundsError extends UnprocessableEntityError {
  constructor (message, accountIdentifier) {
    super(message)
    this.accountIdentifier = accountIdentifier
  }

  * handler (ctx, log) {
    log.warn('Insufficient Funds: ' + this.message)
    ctx.status = 422
    ctx.body = {
      id: this.name,
      message: this.message,
      owner: this.accountIdentifier
    }
  }
}

module.exports = InsufficientFundsError
