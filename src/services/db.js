'use strict'

const co = require('co')
const knex = require('../lib/knex').knex

function transaction (callback) {
  return knex.transaction(co.wrap(callback))
}

module.exports = {
  transaction
}
