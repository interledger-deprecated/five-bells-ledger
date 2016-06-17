'use strict'

const config = require('../services/config')
const _ = require('lodash')
const url = require('url')
const path = require('path')

function parseKnexConnection (uri) {
  if (!uri) {
    return undefined
  }
  if (uri.startsWith('sqlite://')) {
    return {filename: uri.slice(9)}
  }
  const parsed = url.parse(uri)
  const auth = parsed.auth ? parsed.auth.split(':') : []
  return {
    host: parsed.hostname,
    port: parsed.port,
    user: auth[0],
    password: auth[1],
    database: parsed.pathname ? parsed.pathname.slice(1) : undefined
  }
}

function parseDatabaseType (uri) {
  return uri.split(':')[0]
}

function getKnexConfig () {
  const knexConfig = {
    sqlite: {client: 'sqlite3'},
    mysql: {client: 'mysql'},
    postgres: {client: 'pg'},
    oracle: {
      client: 'strong-oracle',
      useNullAsDefault: true,
      pool: {min: 0, max: 2}
    }
  }
  const uri = config.getIn(['db', 'uri'])
  if (!uri) {
    throw new Error('Must set LEDGER_DB_URI or LEDGER_UNIT_DB_URI')
  }
  const databaseType = parseDatabaseType(uri)
  if (!knexConfig[databaseType]) {
    throw new Error('Invalid database type in DB URI')
  }
  const migrations = {directory: path.join(__dirname, 'migrations')}
  const connection = parseKnexConnection(uri)
  const commonConfig = {connection, migrations}
  return _.assign(commonConfig, knexConfig[databaseType])
}

const knexConfig = getKnexConfig()
const knex = require('knex')(knexConfig)

module.exports.knex = knex
module.exports.config = knexConfig
