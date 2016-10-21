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

function parseIlpConfig () {
  return {
    prefix: Config.getEnv(envPrefix, 'ILP_PREFIX') || null
  }
}

function parseAdminConfig () {
  const adminUser = Config.getEnv(envPrefix, 'ADMIN_USER') || 'admin'
  const adminPass = Config.getEnv(envPrefix, 'ADMIN_PASS')
  const adminFingerprint = Config.getEnv(envPrefix, 'ADMIN_TLS_FINGERPRINT')

  if (adminPass || adminFingerprint) {
    return _.omit({
      user: adminUser,
      pass: adminPass,
      fingerprint: adminFingerprint
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
        secret: 'lu+43o/0NUeF5iJTHXQQY6eqMaY06Xx6G1ABc6q1UQk=',
        public: 'YXg177AOkDlGGrBaoSET+UrMscbHGwFXHqfUMBZTtCY='
      }
    }
  } else {
    return {}
  }
}

function parseRecommendedConnectors () {
  const connectorList = Config.getEnv(envPrefix, 'RECOMMENDED_CONNECTORS')
  if (!connectorList || connectorList === '*') return null
  return connectorList.split(',')
}

function getLogLevel () {
  if (useTestConfig()) {
    return 'debug'
  } else {
    // https://github.com/trentm/node-bunyan#levels
    return Config.getEnv(envPrefix, 'LOG_LEVEL') || 'info'
  }
}

function loadConfig () {
  const localConfig = {}

  localConfig.features = parseFeaturesConfig()
  localConfig.amount = parseAmountConfig()
  localConfig.default_admin = parseAdminConfig()
  localConfig.ilp = parseIlpConfig()
  localConfig.recommendedConnectors = parseRecommendedConnectors()
  localConfig.logLevel = getLogLevel()

  // optional
  localConfig.currency = parseCurrencyConfig()
  localConfig.keys = parseKeysConfig()

  const config = Config.loadConfig(envPrefix, _.omit(localConfig, _.isEmpty))
  return config
}

module.exports = loadConfig
