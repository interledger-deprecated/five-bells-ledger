'use strict'

const co = require('co')
const Database = require('rowler').Database
const config = require('./config')

const db = new Database({
  idProp: 'id',
  subspace: config.db.subspace,
  uri: config.db.uri
})

db.open()

// Add co support for transactions
db._transaction = db.transaction
db.transaction = function (generatorFunction) {
  // Turn the generator into a promise, then call upstream transaction().
  return db._transaction(function (tr) {
    const generator = generatorFunction.call(this, tr)
    if (typeof generator === 'object' &&
      typeof generator.next === 'function') {
      return co(generator)
    }

    return generator
  })
}

module.exports = db
