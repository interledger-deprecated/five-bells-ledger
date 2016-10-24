'use strict'

const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const expect = require('chai').expect
const app = require('../src/services/app')
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('./helpers/log')
const sinon = require('sinon')
const transferExpiryMonitor = require('../src/services/transferExpiryMonitor')
const validator = require('./helpers/validator')
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('GET /transfers/:uuid', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.existingTransfer = _.cloneDeep(require('./data/transfers/noAuthorization'))
    this.multiCreditTransfer = _.cloneDeep(require('./data/transfers/multiCredit'))
    this.multiDebitTransfer = _.cloneDeep(require('./data/transfers/multiDebit'))
    this.multiDebitAndCreditTransfer =
      _.cloneDeep(require('./data/transfers/multiDebitAndCredit'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry'))

    // Store some example data
    yield dbHelper.addAccounts(_.values(require('./data/accounts')))
    yield dbHelper.addTransfers([this.existingTransfer])
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 200 for an existing transfer', function * () {
    const transfer = this.existingTransfer
    yield this.request()
      .get(transfer.id)
      .expect(200)
      .expect(transfer)
      .expect(validator.validateTransfer)
      .end()
  })

  it('should return 404 when the transfer does not exist', function * () {
    yield this.request()
      .get(this.exampleTransfer.id)
      .expect(404)
      .end()
  })

  it('should return a rejected transfer if the expiry date has passed', function * () {
    const transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    this.clock.tick(1000)

    // In production this function should be triggered by the worker started in app.js
    yield transferExpiryMonitor.processExpiredTransfers()

    yield this.request()
      .get(transfer.id)
      .expect(200, _.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_REJECTED,
        rejection_reason: 'expired',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z',
          rejected_at: transfer.expires_at
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })
})

describe('GET /transfers/byExecutionCondition/:execution_condition', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry'))
    this.transferWithAndCondition = _.cloneDeep(require('./data/transfers/withAndCondition'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))

    // Store some example data
    yield dbHelper.addAccounts(_.values(require('./data/accounts')))
    yield dbHelper.addTransfers([this.executedTransfer])
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 200 for an existing transfer', function * () {
    const transfer = this.executedTransfer
    yield this.request()
      .get(`/transfers/byExecutionCondition/${transfer.execution_condition}`)
      .expect(200)
      .expect([transfer])
      .expect(validator.validateTransfers)
      .end()
  })

  it('should return 200 for multiple existing transfers', function * () {
    yield dbHelper.addTransfers([this.preparedTransfer])

    const transfer = this.executedTransfer
    yield this.request()
      .get(`/transfers/byExecutionCondition/${transfer.execution_condition}`)
      .expect(200)
      .expect((res) => {
        const sortedResponse = _.sortBy(res.body, (transfer) => {
          return transfer.id
        })
        const sortedTransfers = _.sortBy([transfer, this.preparedTransfer], (transfer) => {
          return transfer.id
        })
        expect(sortedResponse).to.deep.equal(sortedTransfers)
      })
      .expect(validator.validateTransfers)
      .end()
  })

  it('should return 404 when the transfer does not exist', function * () {
    yield this.request()
      .get(`/transfers/byExecutionCondition/${this.transferWithAndCondition.execution_condition}`)
      .expect(404)
      .expect(function (res) {
        expect(res.body.id).to.equal('NotFoundError')
        expect(res.body.message).to.equal('Unknown execution condition')
      })
      .end()
  })

  it('should return 400 when the provided parameter is not an execution condition', function * () {
    yield this.request()
      .get('/transfers/byExecutionCondition/notanexecutioncondition')
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidUriParameterError')
        expect(res.body.message).to.equal('execution_condition is not a valid Condition')
      })
      .end()
  })

  it('should return a rejected transfer if the expiry date has passed', function * () {
    const transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    this.clock.tick(1000)

    // In production this function should be triggered by the worker started in app.js
    yield transferExpiryMonitor.processExpiredTransfers()

    yield this.request()
      .get(`/transfers/byExecutionCondition/${transfer.execution_condition}`)
      .expect(200, [_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_REJECTED,
        rejection_reason: 'expired',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z',
          rejected_at: transfer.expires_at
        }
      })])
      .expect(validator.validateTransfers)
      .end()
  })
})
