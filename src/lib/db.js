'use strict'

const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const connection = require('./knex').config.connection
const spawn = require('child_process').spawn
const knex = require('./knex').knex
const promiseRetry = require('promise-retry')
const sequence = require('./utils').sequence
const readRejectionReasons = require('../models/db/rejectionReasons')
  .readRejectionReasons
const readTransferStatuses = require('../models/db/transferStatuses')
  .readTransferStatuses
const config = require('../services/config')
const sqlDir = path.resolve(__dirname, '..', 'sql')
const log = require('../services/log').create('db')

const TABLE_NAMES = [
  'L_TRANSFER_ADJUSTMENTS',
  'L_ACCOUNTS',
  'L_FULFILLMENTS',
  'L_ENTRIES',
  'L_TRANSFERS',
  'L_LU_REJECTION_REASON',
  'L_LU_TRANSFER_STATUS'
]

const DEFAULT_DB_RETRIES = 5

const withTransaction = knex.transaction.bind(knex)

function withSerializableTransaction (callback, retries = DEFAULT_DB_RETRIES) {
  const dbType = knex.client.config.client
  return promiseRetry(function (retry, attemptNo) {
    return withTransaction(async function (transaction) {
      // Set isolation level to avoid reading "prepared" transaction that is currently being
      // executed by another request. This ensures the transfer can be fulfilled only once.
      assert(_.includes(['sqlite3', 'pg', 'mysql'], dbType),
        'A valid client must be specified on the db object')
      if (dbType === 'pg') {
        await transaction.raw('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
      }

      return callback(transaction)
    }).catch(err => {
      // 40001 is a postgres error code meaning the database could not complete the transaction
      // because this would interfere with other concurrent transactions
      if (err.code === '40001') {
        log.debug('retrying database query', `${attemptNo}/${retries}`, err)
        err.isDbRetry = true
        return retry(err)
      }
      throw err
    })
  }, {
    minTimeout: 10, // milliseconds
    factor: 1.2, // consecutive retries have an increasing timeout
    retries,
    randomize: true // randomizing the duration after which the retry occurs helps if a batch
                    // of transfers/fulfillments are submitted at the same time. Since the
                    // retries do not happen all at the same time, they have a higher likelihood
                    // of succeeding.
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

async function createTables () {
  if (knex.client.config.client === 'pg') {
    await migratePostgres()
  } else {
    await executeScript('create.sql')
  }
}

async function dropTables () {
  if (knex.client.config.client === 'pg') {
    await migratePostgres('1')
  } else {
    await executeScript('drop.sql')
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

async function truncateTables () {
  const dbType = knex.client.config.client
  for (const tableName of TABLE_NAMES) {
    if (!tableName.includes('_LU_')) {
      if (dbType === 'pg') {
        await knex.raw('TRUNCATE TABLE "' + tableName + '" CASCADE;')
      } else {
        await knex(tableName).truncate()
      }
    }
  }
}

async function isConnected () {
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
