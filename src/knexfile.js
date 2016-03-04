'use strict'

const url = require('url')
const path = require('path')
const reSqlite = /^sqlite:\/\//
const dbURI = process.env.LEDGER_DB_URI
let sqliteFilename = 'sqlite.db'
if (reSqlite.test(dbURI)) {
  sqliteFilename = dbURI.replace(reSqlite, '')
}

function parseKnexConnection (uri) {
  if (!uri) {
    return undefined
  }
  const parsed = url.parse(uri)
  const auth = parsed.auth ? parsed.auth.split(':') : []
  return {
    host: parsed.host,
    user: auth[0],
    password: auth[1],
    database: parsed.pathname ? parsed.pathname.slice(1) : undefined
  }
}

module.exports = {
  // sqlite
  development: {
    'client': 'sqlite3',
    'debug': false,
    'connection': {
      'filename': sqliteFilename
    },
    'migrations': {
      directory: path.join(__dirname, 'migrations')
    }
  },
  mysql: {
    client: 'mysql',
    connection: parseKnexConnection(process.env.LEDGER_UNIT_DB_URI),
    migrations: {
      directory: path.join(__dirname, 'migrations')
    }
  },
  postgres: {
    client: 'pg',
    connection: parseKnexConnection(process.env.LEDGER_UNIT_DB_URI),
    migrations: {
      directory: path.join(__dirname, 'migrations')
    }
  },
  // Test with Oracle on Mac
  // Set environment variables
  // NOTARY_DB_ENV=oracledev DYLD_LIBRARY_PATH='/opt/oracle/instantclient'
  oracledev: {
    'debug': true,
    'client': 'strong-oracle',
    'connection': {
      database: '',
      hostname: '192.168.99.100:49161/', // Set this to IP or hostname Oracle Docker is on
      user: 'system', // Use system user ONLY FOR TESTING
      password: 'oracle',
      adapter: 'oracle'
    },
    pool: {
      min: 0,
      max: 7
    },
    'migrations': {
      directory: path.join(__dirname, 'migrations')
    }
  },
  // Test with Oracle on Linux (e.g. on CircleCI)
  // Set environment variables
  // NOTARY_DB_ENV=oracledci LD_LIBRARY_PATH='/opt/oracle/instantclient'
  oracleci: {
    'debug': true,
    'client': 'strong-oracle',
    'connection': {
      database: '',
      hostname: 'localhost:49161/', // Set this to IP or hostname Oracle Docker is on
      user: 'system', // Use system user ONLY FOR TESTING
      password: 'oracle',
      adapter: 'oracle'
    },
    pool: {
      min: 0,
      max: 7
    },
    'migrations': {
      directory: path.join(__dirname, 'migrations')
    }
  }
}
