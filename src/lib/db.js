'use strict'

const co = require('co')
const fs = require('fs')
const path = require('path')
const connection = require('./knex').config.connection
const spawn = require('child_process').spawn
const knex = require('./knex').knex
const sequence = require('./utils').sequence
const readRejectionReasons = require('../models/db/rejectionReasons')
  .readRejectionReasons
const readTransferStatuses = require('../models/db/transferStatuses')
  .readTransferStatuses

const TABLE_NAMES = [
  'L_TRANSFER_ADJUSTMENTS',
  'L_ACCOUNTS',
  'L_FULFILLMENTS',
  'L_ENTRIES',
  'L_TRANSFERS',
  'L_LU_REJECTION_REASON',
  'L_LU_TRANSFER_STATUS'
]

function withTransaction (callback) {
  return knex.transaction(co.wrap(callback))
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
    const childProcess = spawn(command, args, {env})
    childProcess.on('close', (code) => {
      return code === 0 ? resolve() : reject(
        new Error('sqlplus exited with code ' + code))
    })
    childProcess.on('error', reject)
  })
}

function executePSQL (sqlFilepath) {
  return new Promise((resolve, reject) => {
    const command = 'psql'
    const args = [
      '--quiet',
      '--username=' + connection.user,
      '--host=' + connection.host,
      '--port=' + (connection.port || 5432),
      '--dbname=' + connection.database,
      '--file=' + path.resolve(sqlFilepath),
      '--set=ON_ERROR_STOP=1'
    ]
    const env = {
      PATH: process.env.PATH,
      PGPASSWORD: connection.password
    }
    const childProcess = spawn(command, args, {env})
    childProcess.on('close', (code) => {
      return code === 0 ? resolve() : reject(
        new Error('psql exited with code ' + code))
    })
    childProcess.on('error', reject)
  })
}

function executeScript (filename) {
  const dbType = knex.client.config.client
  const filepath = path.resolve(
    __dirname, '..', 'sql', dbType, filename)

  if (dbType === 'strong-oracle') {
    return executeSQLPlus(filepath)
  } else if (dbType === 'pg') {
    return executePSQL(filepath)
  } else {
    const sql = fs.readFileSync(filepath, {encoding: 'utf8'})
    return executeStatements(sql)
  }
}

function createTables () {
  return executeScript('create.sql')
}

function * dropTables () {
  return executeScript('drop.sql')
}

function * truncateTables () {
  const dbType = knex.client.config.client
  if (dbType === 'strong-oracle') {
    yield executeScript('disable.sql')
  }
  for (const tableName of TABLE_NAMES) {
    if (!tableName.includes('_LU_')) {
      if (dbType === 'pg') {
        yield knex.raw('TRUNCATE TABLE "' + tableName + '" CASCADE;')
      } else if (dbType === 'strong-oracle') {
        yield knex.raw('TRUNCATE TABLE "' + tableName + '"')
      } else {
        yield knex(tableName).truncate()
      }
    }
  }
  if (dbType === 'strong-oracle') {
    yield executeScript('enable.sql')
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
