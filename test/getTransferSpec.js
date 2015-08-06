/*global describe, it*/
'use strict'
const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../app')
const db = require('../services/db')
const logger = require('../services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('@ripple/five-bells-shared/testHelpers/log')
const sinon = require('sinon')
const transferExpiryMonitor = require('../services/transferExpiryMonitor')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('GET /transfers/:uuid', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transferSimple'))
    this.existingTransfer = _.cloneDeep(require('./data/transferNoAuthorization'))
    this.multiCreditTransfer = _.cloneDeep(require('./data/transferMultiCredit'))
    this.multiDebitTransfer = _.cloneDeep(require('./data/transferMultiDebit'))
    this.multiDebitAndCreditTransfer =
      _.cloneDeep(require('./data/transferMultiDebitAndCredit'))
    this.executedTransfer = _.cloneDeep(require('./data/transferExecuted'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transferWithExpiry'))

    // Reset database
    yield dbHelper.reset()

    // Store some example data
    yield db.put(['accounts'], require('./data/accounts'))
    yield db.create(['transfers'], this.existingTransfer)
  })

  afterEach(function *() {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 200 for an existing transfer', function *() {
    const transfer = this.formatId(this.existingTransfer, '/transfers/')
    yield this.request()
      .get('/transfers/' + this.existingTransfer.id)
      .expect(200)
      .expect(transfer)
      .end()
  })

  it('should return 404 when the transfer does not exist', function *() {
    yield this.request()
      .get('/transfers/' + this.exampleTransfer.id)
      .expect(404)
      .end()
  })

  it('should return a rejected transfer if the expiry date has passed', function *() {
    const transfer = this.formatId(this.transferWithExpiry, '/transfers/')
    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    yield this.request()
      .put('/transfers/' + this.transferWithExpiry.id)
      .send(transfer)
      .expect(201)
      .end()

    // In production this function should be triggered by the worker started in app.js
    this.clock.tick(100)
    yield transferExpiryMonitor.processExpiredTransfers()

    yield this.request()
      .get('/transfers/' + this.transferWithExpiry.id)
      .expect(200, _.assign({}, transfer, {
        state: 'rejected',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z',
          rejected_at: transfer.expires_at
        }
      }))
      .end()
  })

})
