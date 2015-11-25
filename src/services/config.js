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
  config.db.uri = 'sqlite://:memory:'
  config.updateDerivativeServerConfig()
}

if (config.getEnv('ADMIN_USER')) {
  config.default_admin = {
    user: config.getEnv('ADMIN_USER'),
    pass: config.getEnv('ADMIN_PASS')
  }
}
