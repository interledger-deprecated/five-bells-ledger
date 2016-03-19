'use strict'

const _ = require('lodash')
const chai = require('chai')
const expect = chai.expect
const loadConfig = require('../src/lib/config')

const originalEnv = _.cloneDeep(process.env)
describe('loadConfig', () => {
  beforeEach(() => {
    process.env = _.cloneDeep(originalEnv)
  })

  describe('config.default_admin', () => {
    const defaults = {
      user: 'admin'
    }

    it('LEDGER_ADMIN_PASS=foo', () => {
      process.env.LEDGER_ADMIN_PASS = 'foo'
      const admin = _.defaults({
        pass: 'foo'
      }, defaults)
      const _config = loadConfig()
      expect(_config.default_admin).to.deep.equal(admin)
    })

    it('LEDGER_ADMIN_TLS_FINGERPRINT=foo', () => {
      process.env.LEDGER_ADMIN_TLS_FINGERPRINT = 'foo'
      const admin = _.defaults({
        fingerprint: 'foo'
      }, defaults)
      const _config = loadConfig()
      expect(_config.default_admin).to.deep.equal(admin)
    })
  })

  describe('config.currency', () => {
    const defaults = {
      code: null,
      symbol: null
    }

    it('returns defaults', () => {
      const _config = loadConfig()
      expect(_config.currency).to.deep.equal(defaults)
    })

    it('LEDGER_CURRENCY_CODE=foo', () => {
      process.env.LEDGER_CURRENCY_CODE = 'foo'
      const currency = _.defaults({
        code: 'foo'
      }, defaults)
      const _config = loadConfig()
      expect(_config.currency).to.deep.equal(currency)
    })

    it('LEDGER_CURRENCY_SYMBOL=foo', () => {
      process.env.LEDGER_CURRENCY_SYMBOL = 'foo'
      const currency = _.defaults({
        symbol: 'foo'
      }, defaults)
      const _config = loadConfig()
      expect(_config.currency).to.deep.equal(currency)
    })
  })

  describe('config.features', () => {
    const defaults = {
      hasCreditAuth: false
    }

    it('returns default features config when no env vars set', () => {
      const _config = loadConfig()
      expect(_config.features).to.deep.equal(defaults)
    })

    it('LEDGER_FEATURE_CREDIT_AUTH=1', () => {
      process.env.LEDGER_FEATURE_CREDIT_AUTH = '1'
      const features = _.defaults({
        hasCreditAuth: true
      }, defaults)
      const _config = loadConfig()
      expect(_config.features).to.deep.equal(features)
    })
  })

  describe('config.amount', () => {
    const defaults = {
      precision: 10,
      scale: 2
    }

    it('returns default amount config when no env vars set', () => {
      const _config = loadConfig()
      expect(_config.amount).to.deep.equal(defaults)
    })

    it('LEDGER_AMOUNT_SCALE=10', () => {
      process.env.LEDGER_AMOUNT_SCALE = '10'
      const amount = _.defaults({
        scale: 10
      }, defaults)
      const _config = loadConfig()
      expect(_config.amount).to.deep.equal(amount)
    })

    it('LEDGER_AMOUNT_PRECISION=20', () => {
      process.env.LEDGER_AMOUNT_PRECISION = '20'
      const amount = _.defaults({
        precision: 20
      }, defaults)
      const _config = loadConfig()
      expect(_config.amount).to.deep.equal(amount)
    })
  })

  describe('config.keys', () => {
    const testDefault = {
      ed25519: {
        secret: 'iMx6i3D3acJPc4aJlK0iT/pkJP3T+Dqte9wg6hXpXEv08CpNQSm1J5AI6n/QVBObeuQWdQVpgRQTAJzLLJJA/Q==',
        public: '9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0='
      }
    }

    describe('when testing', () => {
      it('returns test defaults', () => {
        const _config = loadConfig()
        expect(_config.keys).to.deep.equal(testDefault)
      })
    })
  })

  describe('oracledb, amount.precision > 15, not running unit tests', () => {

    it('throws an exception', () => {
      process.env.UNIT_TEST_OVERRIDE = 'true'
      process.env.LEDGER_DB_URI = 'oracle://foo/bar'
      process.env.LEDGER_AMOUNT_PRECISION = 16
      expect(loadConfig).to.throw(/Cannot support precision > 15/)
    })
  })
})
