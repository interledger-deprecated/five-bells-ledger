'use strict';

const UnprocessableEntityError =
  require('five-bells-shared/errors/unprocessable-entity-error');

module.exports = function InsufficientFundsError(message, accountIdentifier) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.accountIdentifier = accountIdentifier;
};

require('util').inherits(module.exports, UnprocessableEntityError);
