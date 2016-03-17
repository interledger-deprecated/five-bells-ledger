'use strict'

const _ = require('lodash')
const Config = require('five-bells-shared').Config
const envPrefix = 'ledger'

function isRunningTests () {
  return process.argv[0].endsWith('mocha') ||
    (process.argv.length > 1 && process.argv[0].endsWith('node') &&
     process.argv[1].endsWith('mocha'))
}

function loadConfig () {
  const localConfig = {
    features: {
      hasCreditAuth: Config.castBool(Config.getEnv(envPrefix, 'FEATURE_CREDIT_AUTH'))
    }
  }

  const admin_user = Config.getEnv(envPrefix, 'ADMIN_USER') || 'admin'
  const admin_pass = Config.getEnv(envPrefix, 'ADMIN_PASS')
  const admin_fingerprint = Config.getEnv(envPrefix, 'ADMIN_TLS_FINGERPRINT')

  if (admin_pass || admin_fingerprint) {
    localConfig.default_admin = _.omit({
      user: admin_user,
      pass: admin_pass,
      fingerprint: admin_fingerprint
    }, _.isUndefined)
  }

  // optional
  localConfig.currency = {
    code: Config.getEnv(envPrefix, 'CURRENCY_CODE') || null,
    symbol: Config.getEnv(envPrefix, 'CURRENCY_SYMBOL') || null
  }

  localConfig.amount = {
    precision: parseInt(Config.getEnv(envPrefix, 'AMOUNT_PRECISION'), 10) || 10,
    scale: parseInt(Config.getEnv(envPrefix, 'AMOUNT_SCALE'), 10) || 2
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

  return Config.loadConfig(envPrefix, localConfig)
}

module.exports = loadConfig
