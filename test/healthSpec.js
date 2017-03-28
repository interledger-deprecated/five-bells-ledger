'use strict'

const superagent = require('co-supertest')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../src/services/app')
const dbHelper = require('./helpers/db')
const accounts = require('./data/accounts')
const logger = require('../src/services/log')
const logHelper = require('./helpers/log')
const expect = require('chai').expect

function request () {
  return superagent(app.koa.listen())
}

describe('Health', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
    yield dbHelper.clean()
    yield dbHelper.addAccounts([
      accounts.admin
    ])
  })

  describe('GET /health', function () {
    it('should return 200 for an authenticated request', function * () {
      yield request()
        .get('/health')
        .auth('admin', 'admin')
        .expect(200)
        .expect((res) => {
          expect(res.body).to.deep.equal({
            status: 'OK'
          })
        })
        .end()
    })

    it('should return 401 for an unauthenticated request', function * () {
      yield request()
        .get('/health')
        .expect(401)
        .end()
    })
  })
})
