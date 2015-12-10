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

let admin_user = config.getEnv('ADMIN_USER') || 'admin'
let admin_pass = config.getEnv('ADMIN_PASS')
if (admin_pass) {
  config.default_admin = {
    user: admin_user,
    pass: admin_pass
  }
}
