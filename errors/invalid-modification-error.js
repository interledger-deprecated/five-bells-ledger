'use strict';

module.exports = function InvalidModificationError(message, invalidDiffs) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.invalidDiffs = invalidDiffs;
};

require('util').inherits(module.exports, Error);
