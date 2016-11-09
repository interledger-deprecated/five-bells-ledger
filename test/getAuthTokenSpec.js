'use strict'

const _ = require('lodash')
const assert = require('assert')
const jwt = require('jsonwebtoken')
const app = require('../src/services/app')
const logger = require('../src/services/log')
const config = require('../src/services/config')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('./helpers/log')
const accounts = require('./data/accounts')

describe('GET /auth_token', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()
    // Store some example data
    yield dbHelper.addAccounts(_.values(_.omit(accounts, 'noBalance')))
  })

  it('returns 200 and a token on success', function * () {
    yield this.request()
      .get('/auth_token')
      .auth('alice', 'alice')
      .expect(200)
      .expect((res) => {
        assert.deepEqual(Object.keys(res.body), ['token'])
        const token = jwt.verify(res.body.token, config.authTokenSecret)
        assert.equal(token.iss, 'http://localhost')
        assert.equal(token.sub, 'http://localhost/accounts/alice')
        assert.ok(typeof token.iat === 'number')
        assert.ok(typeof token.exp === 'number')
      })
      .end()
  })

  it('returns 401 when not authenticated', function * () {
    yield this.request()
      .get('/auth_token')
      .expect(401)
      .end()
  })
})
