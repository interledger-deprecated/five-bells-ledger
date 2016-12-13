'use strict'

const _ = require('lodash')
const co = require('co')
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const connection = require('./knex').config.connection
const spawn = require('child_process').spawn
const knex = require('./knex').knex
const sequence = require('./utils').sequence
const readRejectionReasons = require('../models/db/rejectionReasons')
  .readRejectionReasons
const readTransferStatuses = require('../models/db/transferStatuses')
  .readTransferStatuses
const config = require('../services/config')
const sqlDir = path.resolve(__dirname, '..', 'sql')

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

function withSerializableTransaction (callback) {
  const dbType = knex.client.config.client
  return withTransaction(function * (transaction) {
    // Set isolation level to avoid reading "prepared" transaction that is currently being
    // executed by another request. This ensures the transfer can be fulfilled only once.
    assert(_.includes(['sqlite3', 'pg', 'mysql'], dbType),
      'A valid client must be specified on the db object')
    if (dbType === 'pg') {
      yield transaction.raw('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    }

    return yield callback(transaction)
  })
}

function executeStatements (sql) {
  const separator = ';\n'
  const statements = sql.split(separator)
  return sequence(statements.map((statement) => {
    const line = statement.replace(/\n$/, '')
    return line ? knex.raw(line) : Promise.resolve()
  }))
}

function executePSQL (sqlFilepath) {
  return new Promise((resolve, reject) => {
    const command = 'psql'
    const args = [
      '--quiet',
      '--host=' + connection.host,
      '--port=' + (connection.port || 5432),
      '--dbname=' + connection.database,
      '--file=' + path.resolve(sqlFilepath),
      '--set=ON_ERROR_STOP=1'
    ]

    if (connection.user) {
      args.push('--username=' + connection.user)
    }

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
  const filepath = path.resolve(sqlDir, dbType, filename)

  if (dbType === 'pg') {
    return executePSQL(filepath)
  } else {
    const sql = fs.readFileSync(filepath, {encoding: 'utf8'})
    return executeStatements(sql)
  }
}

function * createTables () {
  if (knex.client.config.client === 'pg') {
    yield migratePostgres()
  } else {
    yield executeScript('create.sql')
  }
}

function * dropTables () {
  if (knex.client.config.client === 'pg') {
    yield migratePostgres('1')
  } else {
    yield executeScript('drop.sql')
  }
}

function migratePostgres (step) {
  return new Promise((resolve, reject) => {
    const args = [config.db.uri]
    if (step) args.push(step)
    const childProcess = spawn('pg-migrator', args, {cwd: path.resolve(sqlDir, 'pg')})
    let error = ''
    childProcess.on('error', reject)
    childProcess.stderr.on('data', (data) => { error += data.toString() })
    childProcess.on('close', (code) => {
      return code === 0 ? resolve() : reject(
        new Error('pg-migrator exited with code ' + code + ' stderr: ' + error))
    })
  })
}

function * truncateTables () {
  const dbType = knex.client.config.client
  for (const tableName of TABLE_NAMES) {
    if (!tableName.includes('_LU_')) {
      if (dbType === 'pg') {
        yield knex.raw('TRUNCATE TABLE "' + tableName + '" CASCADE;')
      } else {
        yield knex(tableName).truncate()
      }
    }
  }
}

function * isConnected () {
  return knex.raw('SELECT 1')
  .then(() => {
    return true
  })
  .catch(() => {
    return false
  })
}

function readLookupTables () {
  return Promise.all([readRejectionReasons(), readTransferStatuses()])
}

module.exports = {
  createTables,
  dropTables,
  truncateTables,
  readLookupTables,
  withTransaction,
  withSerializableTransaction,
  isConnected
}
