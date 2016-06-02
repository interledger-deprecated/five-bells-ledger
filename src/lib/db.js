'use strict'

const fs = require('fs')
const path = require('path')
const connection = require('./knex').config.connection
const spawn = require('child_process').spawn

function sequence (promises) {
  return promises.length === 0 ? Promise.resolve()
    : promises[0].then(() => sequence(promises.slice(1)))
}

function executeStatements (knex, sql) {
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

function createTables (knex, knexConfig) {
  const dbType = knex.client.config.client
  const filepath = path.resolve(
    __dirname, '..', 'sql', dbType, 'create.sql')

  if (dbType === 'strong-oracle') {
    return executeSQLPlus(filepath)
  } else {
    const sql = fs.readFileSync(filepath, {encoding: 'utf8'})
    return executeStatements(knex, sql)
  }
}

module.exports = {
  createTables
}
