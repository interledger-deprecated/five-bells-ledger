'use strict'

exports.defer = function () {
  return new Promise((resolve) => setImmediate(resolve))
}
