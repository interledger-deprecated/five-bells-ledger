'use strict'

const co = require('co')
const fs = require('fs')
const path = require('path')
const connection = require('./knex').config.connection
const spawn = require('child_process').spawn
const knex = require('./knex').knex
const readRejectionReasons = require('../models/db/rejectionReasons')
  .readRejectionReasons
const readTransferStatuses = require('../models/db/transferStatuses')
  .readTransferStatuses

const TABLE_NAMES = [
  'L_ACCOUNTS',
  'L_FULFILLMENTS',
  'L_ENTRIES',
  'L_NOTIFICATIONS',
  'L_SUBSCRIPTIONS',
  'L_TRANSFERS',
  'L_LU_REJECTION_REASON',
  'L_LU_TRANSFER_STATUS'
]

function withTransaction (callback) {
  return knex.transaction(co.wrap(callback))
}

function sequence (promises) {
  return promises.length === 0 ? Promise.resolve()
    : promises[0].then(() => sequence(promises.slice(1)))
}

function executeStatements (sql) {
  const separator = ';\n'
  const statements = sql.split(separator)
  return sequence(statements.map((statement) => {
    const line = statement.replace(/\n$/, '')
    return line ? knex.raw(line) : Promise.resolve()
  }))
}

function executeSQLPlus (sqlFilepath) {
  return new Promise((resolve, reject) => {
    const user = connection.user
    const password = connection.password
    const host = connection.host
    const port = connection.port
    const database = connection.database
    const login = user + '/' + password + '@' + host + ':' + port
    const url = login + (database ? '/' + database : '')
    const env = {
      LD_LIBRARY_PATH: '/opt/oracle/instantclient',
      DYLD_LIBRARY_PATH: '/opt/oracle/instantclient'
    }
    const command = '/opt/oracle/instantclient/sqlplus'
    const args = [url, '@' + sqlFilepath]
    const process = spawn(command, args, {env})
    process.on('close', (code) => {
      return code === 0 ? resolve() : reject('sqlplus exited with code ' + code)
    })
  })
}

function createTables () {
  const dbType = knex.client.config.client
  const filepath = path.resolve(
    __dirname, '..', 'sql', dbType, 'create.sql')

  if (dbType === 'strong-oracle') {
    return executeSQLPlus(filepath)
  } else {
    const sql = fs.readFileSync(filepath, {encoding: 'utf8'})
    return executeStatements(sql)
  }
}

function * dropTables () {
  for (const tableName of TABLE_NAMES) {
    yield knex.schema.dropTableIfExists(tableName).then()
  }
}

function * truncateTables () {
  for (const tableName of TABLE_NAMES) {
    if (!tableName.includes('_LU_')) {
      yield knex(tableName).truncate().then()
    }
  }
}

function readLookupTables () {
  return Promise.all([readRejectionReasons(), readTransferStatuses()])
}

module.exports = {
  createTables,
  dropTables,
  truncateTables,
  readLookupTables,
  withTransaction
}
