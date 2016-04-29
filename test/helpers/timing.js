'use strict'

/**
 * Return a promise that resolves after the current event loop iteration.
 */
exports.defer = function () {
  return new Promise((resolve) => setImmediate(resolve))
}

/**
 * Return a promise that resolves after a time.
 *
 * @param {Number} duration Wait time in milliseconds
 */
exports.sleep = function (duration) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}
