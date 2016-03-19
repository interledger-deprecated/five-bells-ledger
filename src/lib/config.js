'use strict'

const _ = require('lodash')
const Config = require('five-bells-shared').Config
const envPrefix = 'ledger'

function isRunningTests () {
  return process.argv[0].endsWith('mocha') ||
    (process.argv.length > 1 && process.argv[0].endsWith('node') &&
     process.argv[1].endsWith('mocha'))
}

function useTestConfig () {
  return !Config.castBool(process.env.UNIT_TEST_OVERRIDE) && isRunningTests()
}

function parseAmountConfig () {
  return {
    precision: parseInt(Config.getEnv(envPrefix, 'AMOUNT_PRECISION'), 10) || 10,
    scale: parseInt(Config.getEnv(envPrefix, 'AMOUNT_SCALE'), 10) || 2
  }
}

function parseCurrencyConfig () {
  return {
    code: Config.getEnv(envPrefix, 'CURRENCY_CODE') || null,
    symbol: Config.getEnv(envPrefix, 'CURRENCY_SYMBOL') || null
  }
}

function parseAdminConfig () {
  const admin_user = Config.getEnv(envPrefix, 'ADMIN_USER') || 'admin'
  const admin_pass = Config.getEnv(envPrefix, 'ADMIN_PASS')
  const admin_fingerprint = Config.getEnv(envPrefix, 'ADMIN_TLS_FINGERPRINT')

  if (admin_pass || admin_fingerprint) {
    return _.omit({
      user: admin_user,
      pass: admin_pass,
      fingerprint: admin_fingerprint
    }, _.isUndefined)
  }
}

function parseFeaturesConfig () {
  return {
    hasCreditAuth: Config.castBool(Config.getEnv(envPrefix, 'FEATURE_CREDIT_AUTH'))
  }
}

function parseKeysConfig () {
  if (useTestConfig()) {
    return {
      ed25519: {
        secret: 'iMx6i3D3acJPc4aJlK0iT/pkJP3T+Dqte9wg6hXpXEv08CpNQSm1J5AI6n/' +
          'QVBObeuQWdQVpgRQTAJzLLJJA/Q==',
        public: '9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0='
      }
    }
  }
}

function validateConfig () {
  // Validate precision
  const commonConfig = Config.loadConfig(envPrefix)
  const isOracle = commonConfig.get('db.uri').match(/oracle/) !== null
  const amountConfig = parseAmountConfig()

  // strong-oracle return native JS Numbers from Number type columns
  // Cannot support precision greater than 15
  if (!useTestConfig() && isOracle && amountConfig.precision > 15) {
    throw new Error('Cannot support precision > 15 with OracleDB')
  }
}

function loadConfig () {
  validateConfig()
  const localConfig = {}

  localConfig.features = parseFeaturesConfig()
  localConfig.amount = parseAmountConfig()
  localConfig.default_admin = parseAdminConfig()

  // optional
  localConfig.currency = parseCurrencyConfig()
  localConfig.keys = parseKeysConfig()

  return Config.loadConfig(envPrefix, _.omit(localConfig, _.isEmpty))
}

module.exports = loadConfig
