'use strict';

module.exports = handleError;

const log = require('../services/log')('error-handler');

const handlers = handleError.handlers = {
  InvalidBodyError: function (err) {
    log.warn('Invalid Body: ' + err.message);
    this.status = 400;
    this.body = {
      id: err.name,
      message: err.message,
      validationErrors: err.validationErrors
    };
  },
  InvalidModificationError: function (err) {
    log.warn('Invalid Modification: ' + err.message);
    this.status = 400;
    this.body = {
      id: err.name,
      message: err.message,
      invalidDiffs: err.invalidDiffs
    };
  },
  InvalidUriParameterError: function (err) {
    log.warn('Invalid URI parameter: ' + err.message);
    this.status = 400;
    this.body = {
      id: err.name,
      message: err.message,
      validationErrors: err.validationErrors
    };
  },
  UnprocessableEntityError: function (err) {
    log.warn('Unprocessable: ' + err.message);
    this.status = 422;
    this.body = {
      id: err.name,
      message: err.message
    };
  },
  InsufficientFundsError: function (err) {
    log.warn('Insufficient Funds: ' + err.message);
    this.status = 422;
    this.body = {
      id: err.name,
      message: err.message,
      owner: err.accountIdentifier
    };
  },
  NotFoundError: function (err) {
    log.warn('Not Found: ' + err.message);
    this.status = 404;
    this.body = {
      id: err.name,
      message: err.message
    };
  },
  AlreadyExistsError: function (err) {
    log.warn('Already Exists: ' + err.message);
    this.status = 409;
    this.body = {
      id: err.name,
      message: err.message
    };
  }
};

function *handleError(next) {
  try {
    yield next;
  } catch (err) {
    if (handlers[err.constructor.name]) {
      handlers[err.constructor.name].call(this, err);
    } else {
      log.error('' + err);
      throw err;
    }
  }
}
