'use strict'

const ExtensibleError = require('extensible-error')

class InvalidModificationError extends ExtensibleError {
  constructor (message, invalidDiffs) {
    super(message)

    this.status = 400
    this.invalidDiffs = invalidDiffs
  }

  formatDiff (diff) {
    if (typeof diff !== 'object') {
      return JSON.stringify(diff)
    }

    const path = diff.path ? ' `' + diff.path.join('.') + '`' : ''
    switch (diff.kind) {
      case 'N':
        return 'added' + path + ', value: ' + JSON.stringify(diff.rhs)
      case 'D':
        return 'deleted' + path + ', was: ' + JSON.stringify(diff.lhs)
      case 'E':
        return 'changed' + path + ' from: ' + JSON.stringify(diff.lhs) +
          ' to: ' + JSON.stringify(diff.rhs)
      case 'A':
        return 'array' + path + ', index ' + diff.index +
          ' ' + this.formatDiff(diff.item)
      default:
        return JSON.stringify(diff)
    }
  }

  debugPrint (log) {
    for (let diff of this.invalidDiffs) {
      log.debug(' -- ' + this.formatDiff(diff))
    }
  }
}

module.exports = InvalidModificationError
