'use strict'

const ExtensibleError = require('extensible-error')

class InvalidBodyError extends ExtensibleError {
  constructor (message, validationErrors) {
    super(message)

    this.status = 400
    this.validationErrors = validationErrors
  }

  debugPrint (log, validationError, indent) {
    if (!validationError) {
      if (this.validationErrors) {
        for (let ve of this.validationErrors) {
          this.debugPrint(log, ve)
        }
      } else {
        return
      }
    }

    indent = indent || ''
    log.debug(indent + '-- ' + validationError)

    // For additionalProperties errors we want to show the name of the property
    // that violated the constraint.
    if (validationError.code === 303) {
      log.debug(indent + '   ' + validationError.dataPath)
    } else {
      log.debug(indent + '   ' + validationError.schemaPath)
    }

    if (validationError.subErrors) {
      validationError.subErrors.forEach((subError) => {
        this.debugPrint(log, subError, '  ' + indent)
      })
    }
  }
}

module.exports = InvalidBodyError
