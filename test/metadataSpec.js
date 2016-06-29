'use strict'

const superagent = require('co-supertest')
const nock = require('nock')
const expect = require('chai').expect
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../src/services/app')
const logger = require('../src/services/log')
const logHelper = require('five-bells-shared/testHelpers/log')
const config = require('../src/services/config')

function request () {
  return superagent(app.koa.listen())
}

describe('Metadata', function () {
  logHelper(logger)

  describe('GET /', function () {
    it('should return metadata', function * () {
      const notificationPublicKey = config.getIn(['keys', 'notification_sign', 'public'])
      yield request()
        .get('/')
        .expect(200)
        .expect(function (res) {
          expect(res.body).to.deep.equal({
            currency_code: null,
            currency_symbol: null,
            condition_sign_public_key: 'YXg177AOkDlGGrBaoSET+UrMscbHGwFXHqfUMBZTtCY=',
            notification_sign_public_key: notificationPublicKey,
            urls: {
              health: 'http://localhost/health',
              transfer: 'http://localhost/transfers/:id',
              transfer_fulfillment: 'http://localhost/transfers/:id/fulfillment',
              transfer_state: 'http://localhost/transfers/:id/state',
              connectors: 'http://localhost/connectors',
              accounts: 'http://localhost/accounts',
              account: 'http://localhost/accounts/:name'
            },
            precision: 10,
            scale: 2
          })
        })
        .end()
    })
  })
})
