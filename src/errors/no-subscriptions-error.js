'use strict'

const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')

class NoSubscriptionsError extends UnprocessableEntityError {
  * handler (ctx, log) {
    log.warn('No Subscriptions: ' + this.message)
    ctx.status = 422
    ctx.body = {
      id: this.name,
      message: this.message
    }
  }
}

module.exports = NoSubscriptionsError
