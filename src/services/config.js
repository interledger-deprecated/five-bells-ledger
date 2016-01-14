'use strict'

const Config = require('five-bells-shared').Config

const config = module.exports = new Config('ledger')

config.parseServerConfig()
config.parseDatabaseConfig()
config.parseKeyConfig()

if (process.env.NODE_ENV === 'unit') {
  config.server.public_host = 'localhost'
  config.server.port = 61337
  config.server.public_port = 80
  // We use a different config parameter for unit tests, because typically one
  // wouldn't want to use their production or even dev databases for unit tests
  // and it'd be far to easy to do that accidentally by running npm test.
  config.db.uri = process.env.LEDGER_UNIT_DB_URI || 'sqlite://'
  config.updateDerivativeServerConfig()
}

let admin_user = config.getEnv('ADMIN_USER') || 'admin'
let admin_pass = config.getEnv('ADMIN_PASS')
if (admin_pass) {
  config.default_admin = {
    user: admin_user,
    pass: admin_pass
  }
}

config.auth = {
  basic_enabled: !isFalse(config.getEnv('AUTH_BASIC_ENABLED')),
  http_signature_enabled: !isFalse(config.getEnv('AUTH_HTTP_SIGNATURE_ENABLED'))
}

function isFalse (val) { return val === '0' || val === 'false' }
