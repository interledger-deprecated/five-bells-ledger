/*global describe, it*/
'use strict'
const app = require('../src/services/app')
const logger = require('../src/services/log')
const config = require('../src/services/config')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')

describe('Transfer State', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)
  })

  describe('GET /transfers/public_key', function () {
    it('should return the ledger\'s ed25519 public key', function *() {
      yield this.request()
        .get('/transfers/public_key')
        .expect(200, {
          public_key: config.getIn(['keys', 'ed25519', 'public'])
        })
        .end()
    })
  })
})
