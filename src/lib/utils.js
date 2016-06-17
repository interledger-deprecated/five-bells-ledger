'use strict'

function sequence (promises) {
  return promises.length === 0 ? Promise.resolve()
    : promises[0].then(() => sequence(promises.slice(1)))
}

module.exports = {
  sequence
}
