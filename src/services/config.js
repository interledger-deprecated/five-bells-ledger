'use strict'

const Config = require('five-bells-shared').Config

const config = module.exports = new Config('ledger')

config.parseServerConfig()
config.parseDatabaseConfig()
config.parseKeyConfig()

function isRunningTests () {
  return (process.argv[0].endsWith('mocha') ||
    (process.argv.length > 1 && process.argv[0].endsWith('node') &&
     process.argv[1].endsWith('mocha')))
}

if (isRunningTests()) {
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
  basic_enabled: Config.castBool(config.getEnv('AUTH_BASIC_ENABLED'), true),
  http_signature_enabled: Config.castBool(config.getEnv('AUTH_HTTP_SIGNATURE_ENABLED'), true)
}
