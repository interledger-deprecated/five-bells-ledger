'use strict'

const superagent = require('co-supertest')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../app')
const logger = require('../services/log')
const logHelper = require('@ripple/five-bells-shared/testHelpers/log')

function request () {
  return superagent(app.listen())
}

describe('Health', function () {
  logHelper(logger)

  describe('GET /health', function () {
    it('should return 200', function *() {
      yield request()
        .get('/health')
        .expect(200)
        .end()
    })
  })
})
