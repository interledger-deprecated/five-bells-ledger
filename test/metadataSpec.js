'use strict'

const superagent = require('co-supertest')
const nock = require('nock')
const expect = require('chai').expect
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../src/services/app')
const logger = require('../src/services/log')
const logHelper = require('five-bells-shared/testHelpers/log')

function request () {
  return superagent(app.koa.listen())
}

describe('Metadata', function () {
  logHelper(logger)

  describe('GET /', function () {
    it('should return metadata', function * () {
      yield request()
        .get('/')
        .expect(200)
        .expect(function (res) {
          expect(res.body).to.deep.equal({
            currency_code: null,
            currency_symbol: null,
            public_key: '9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0=',
            urls: {
              health: '/health',
              transfer: '/transfers/:id',
              transfer_fulfillment: '/transfers/:id/fulfillment',
              transfer_state: '/transfers/:id/state',
              connectors: '/connectors',
              accounts: '/accounts',
              account: '/accounts/:name',
              subscription: '/subscriptions/:id',
              subscription_notification: '/subscriptions/:subscription_id/notifications/:notification_id'
            },
            precision: 10,
            scale: 2
          })
        })
        .end()
    })
  })
})
