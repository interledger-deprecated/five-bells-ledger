'use strict'

const Config = require('five-bells-shared').Config
const envPrefix = 'ledger'

function isRunningTests () {
  return process.argv[0].endsWith('mocha') ||
    (process.argv.length > 1 && process.argv[0].endsWith('node') &&
     process.argv[1].endsWith('mocha'))
}

const localConfig = {}
const admin_user = Config.getEnv(envPrefix, 'ADMIN_USER') || 'admin'
const admin_pass = Config.getEnv(envPrefix, 'ADMIN_PASS')

if (admin_pass) {
  localConfig.default_admin = {
    user: admin_user,
    pass: admin_pass
  }
}

if (isRunningTests()) {
  localConfig.keys = {
    ed25519: {
      secret: 'iMx6i3D3acJPc4aJlK0iT/pkJP3T+Dqte9wg6hXpXEv08CpNQSm1J5AI6n/' +
        'QVBObeuQWdQVpgRQTAJzLLJJA/Q==',
      public: '9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0='
    }
  }
}

module.exports = Config.loadConfig(envPrefix, localConfig)
