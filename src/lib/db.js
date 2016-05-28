'use strict'

const fs = require('fs')
const path = require('path')

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

function createTables (knex, knexConfig) {
  const dbType = knex.client.config.client
  const filepath = path.resolve(
    __dirname, '..', 'sql', dbType, 'create.sql')

  const sql = fs.readFileSync(filepath, {encoding: 'utf8'})
  return executeStatements(knex, sql)
}

module.exports = {
  createTables
}
