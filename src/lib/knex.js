'use strict'

function getKnexConfigType () {
  if (process.env.LEDGER_DB_ENV) {
    return process.env.LEDGER_DB_ENV
  }
  if (process.env.LEDGER_UNIT_DB_URI) {
    if (process.env.LEDGER_UNIT_DB_URI.startsWith('mysql:')) {
      return 'mysql'
    }
    if (process.env.LEDGER_UNIT_DB_URI.startsWith('postgres:')) {
      return 'postgres'
    }
  }
  return 'development'
}

// This module encapsulates Knex instance, which is used to access database.
// Environment variable LEDGER_DB_ENV should be set according to deployment type
// E.g., 'production' or 'staging'.
// This is used to look up Knex configuration in knexfile.js
const knexConfig = require('../knexfile')[getKnexConfigType()]
const knex = require('knex')(knexConfig)
const path = require('path')

module.exports.knex = knex
module.exports.config = {
  directory: path.join(__dirname, '../migrations'),
  // this table will be populated with some information about your
  // migration files.  it will be automatically created, if it
  // doesn't already exist.
  tableName: 'migrations',
  client: knexConfig.client
}
