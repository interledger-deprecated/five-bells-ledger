'use strict'

const superagent = require('supertest')
const nock = require('nock')
const expect = require('chai').expect
nock.enableNetConnect(['localhost', '127.0.0.1'])
const App = require('../src/lib/app')
const app = require('../src/services/app')
const logger = require('../src/services/log')
const logHelper = require('./helpers/log')

function request () {
  return superagent(app.koa.listen())
}

describe('Metadata', function () {
  logHelper(logger)

  delete process.env.LEDGER_AMOUNT_PRECISION
  delete process.env.UNIT_TEST_OVERRIDE

  describe('GET /', function () {
    it('should return metadata', async function () {
      await request()
        .get('/')
        .expect(200)
        .expect(function (res) {
          expect(res.body).to.deep.equal({
            currency_code: null,
            currency_symbol: null,
            ilp_prefix: null,
            condition_sign_public_key: 'YXg177AOkDlGGrBaoSET+UrMscbHGwFXHqfUMBZTtCY=',
            urls: {
              health: 'http://localhost/health',
              transfer: 'http://localhost/transfers/:id',
              transfer_fulfillment: 'http://localhost/transfers/:id/fulfillment',
              transfer_rejection: 'http://localhost/transfers/:id/rejection',
              transfer_state: 'http://localhost/transfers/:id/state',
              accounts: 'http://localhost/accounts',
              account: 'http://localhost/accounts/:name',
              auth_token: 'http://localhost/auth_token',
              websocket: 'ws://localhost/websocket',
              message: 'http://localhost/messages'
            },
            version: 'five-bells@20',
            precision: 19,
            scale: 9,
            connectors: []
          })
        })
    })

    it('should return metadata when values are set', async function () {
      delete process.env.UNIT_TEST_OVERRIDE

      process.env.LEDGER_CURRENCY_CODE = 'USD'
      process.env.LEDGER_CURRENCY_SYMBOL = '$'
      process.env.LEDGER_ILP_PREFIX = 'example.red.'
      process.env.LEDGER_RECOMMENDED_CONNECTORS = 'trader'

      const newApp = new App({
        log: require('../src/services/log'),
        // required in order to reload environment variables
        config: require('../src/lib/config')(),
        timerWorker: require('../src/services/timerWorker'),
        notificationBroadcaster: require('../src/services/notificationBroadcaster')
      })
      const agent = superagent(newApp.koa.listen())

      await agent
        .get('/')
        .expect(200)
        .expect(function (res) {
          expect(res.body).to.deep.equal({
            currency_code: 'USD',
            currency_symbol: '$',
            ilp_prefix: 'example.red.',
            condition_sign_public_key: 'YXg177AOkDlGGrBaoSET+UrMscbHGwFXHqfUMBZTtCY=',
            urls: {
              health: 'http://localhost/health',
              transfer: 'http://localhost/transfers/:id',
              transfer_fulfillment: 'http://localhost/transfers/:id/fulfillment',
              transfer_rejection: 'http://localhost/transfers/:id/rejection',
              transfer_state: 'http://localhost/transfers/:id/state',
              accounts: 'http://localhost/accounts',
              account: 'http://localhost/accounts/:name',
              auth_token: 'http://localhost/auth_token',
              websocket: 'ws://localhost/websocket',
              message: 'http://localhost/messages'
            },
            version: 'five-bells@20',
            precision: 19,
            scale: 9,
            connectors: [
              {
                id: 'http://localhost/accounts/trader',
                name: 'trader'
              }
            ]
          })
        })

      delete process.env.LEDGER_CURRENCY_CODE
      delete process.env.LEDGER_CURRENCY_SYMBOL
      delete process.env.LEDGER_ILP_PREFIX
    })
  })
})
