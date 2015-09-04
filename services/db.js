'use strict'

const co = require('co')
const Sequelize = require('sequelize')
const config = require('./config')
const log = require('./log')('db')

const db = new Sequelize(config.db.uri, {
  logging: log.debug,
  omitNull: true
})

// Add co support for transactions
db._transaction = db.transaction
db.transaction = function (generatorFunction) {
  if (typeof generatorFunction !== 'function') {
    return db._transaction(generatorFunction)
  }

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
