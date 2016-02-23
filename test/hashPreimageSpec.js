/*global describe, it*/
'use strict'
const app = require('../src/services/app')
const logger = require('../src/services/log')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')

const transferId = '6f456063-865c-4777-b9a1-a0200f808cf9'

describe('Transfer State', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)
  })

  describe('GET /transfers/:id/hash_preimage', function () {
    it('should return the preimage for the transfer\'s current state, if condition_state is not specified', function *() {
      yield this.request()
        .get('/transfers/' + transferId + '/hash_preimage')
        .expect(200, {
          condition_state: 'nonexistent',
          condition_digest: 'vRWgPTgtAAwdTsMgBKUcg+2mB4sOw5UuEZEmDbLZPQ0='
        })
        .end()
    })

    it('should return the hash preimage of the specified state', function *() {
      const conditionState = 'executed'
      const expectedDigest = 'WpSLP4JwaY1iUymE90HnFCV4LUjhoodG3e/fWJT1EdQ='
      yield this.request()
        .get('/transfers/' + transferId + '/hash_preimage?condition_state=' + conditionState)
        .expect(200, {
          condition_state: conditionState,
          condition_digest: expectedDigest
        })
        .end()
    })
  })
})
