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
const accounts = require('./data/accounts')
const validator = require('./helpers/validator')
const getAccount = require('../src/models/db/accounts').getAccount

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('GET /fulfillment', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    this.proposedTransfer = _.cloneDeep(require('./data/transfers/proposed'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.invalidTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry.json'))

    this.executionConditionFulfillment = _.cloneDeep(require('./data/fulfillments/execution'))
    this.cancellationConditionFulfillment = _.cloneDeep(require('./data/fulfillments/cancellation'))
    this.invalidExecutionConditionFulfillment =
      _.cloneDeep(require('./data/fulfillments/executionInvalid'))

    yield dbHelper.addAccounts(_.values(accounts))
    yield dbHelper.addTransfers([this.proposedTransfer, this.preparedTransfer, this.executedTransfer])
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
  })

  /* GET fulfillments */
  it('should return 404 for fulfillment when given an invalid transfer id', function * () {
    yield this.request()
      .get(this.invalidTransfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(404)
      .expect({
        id: 'TransferNotFoundError',
        message: 'This transfer does not exist'
      })
      .end()
  })

  it('should return 404 if the transfer has no fulfillment', function * () {
    const transfer = this.proposedTransfer
    yield this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(404)
      .expect({
        id: 'MissingFulfillmentError',
        message: 'This transfer has not yet been fulfilled'
      })
      .end()
  })

  it('should return a 422 if the transfer has already expired', function * () {
    const transfer = this.transferWithExpiry
    transfer.execution_condition = this.preparedTransfer.execution_condition
    yield this.request()
      .put(transfer.id)
      .auth('admin', 'admin')
      .send(transfer)
      .end()

    this.clock.tick(10000000)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(422)
      .expect({
        id: 'ExpiredTransferError',
        message: 'Cannot modify transfer after expires_at date'
      })
      .end()
  })

  it('should return AlreadyRolledBackError if the transfer is rejected', function * () {
    const transfer = Object.assign(this.proposedTransfer, {
      id: 'http://localhost/transfers/25644640-d140-450e-b94b-badbe23d3382',
      state: 'rejected'
    })
    yield dbHelper.addTransfers([transfer])
    yield this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(422)
      .expect({
        id: 'AlreadyRolledBackError',
        message: 'This transfer has already been rejected'
      })
      .end()
  })

  it('should return TransferNotConditionalError for an optimistic transfer', function * () {
    const transfer = Object.assign(this.proposedTransfer, {
      id: 'http://localhost/transfers/25644640-d140-450e-b94b-badbe23d3381',
      execution_condition: undefined,
      cancellation_condition: undefined
    })
    yield dbHelper.addTransfers([transfer])
    yield this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(422)
      .expect({
        id: 'TransferNotConditionalError',
        message: 'Transfer does not have any conditions'
      })
      .end()
  })

  it('should return 404 if the transfer has no fulfillment and has already expired', function * () {
    const transfer = Object.assign(this.proposedTransfer, {
      id: 'http://localhost/transfers/25644640-d140-450e-b94b-badbe23d3380',
      expires_at: (new Date(Date.now() - 1)).toISOString()
    })
    yield dbHelper.addTransfers([transfer])
    yield this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(404)
      .expect({
        id: 'MissingFulfillmentError',
        message: 'This transfer expired before it was fulfilled'
      })
      .end()
  })

  it('should return a fulfillment', function * () {
    const transfer = this.preparedTransfer

    yield dbHelper.setHoldBalance(10)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .expect(validator.validateFulfillment)
      .end()

    yield this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(200)
      .expect(this.executionConditionFulfillment)
      .expect(validator.validateFulfillment)
      .end()
  })

  /* put fulfillments */
  /* Fulfillment errors */
  it('should return 400 if a valid execution condition is given to an unauthorized transfer', function * () {
    const transfer = this.proposedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(400)
      .end()
  })

  it('should return 400 if a valid cancellation condition is given for an executed transfer', function * () {
    const transfer = this.executedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.cancellationConditionFulfillment)
      .expect(400)
      .end()
  })

  it('should return 422 if the signature is invalid', function * () {
    const transfer = this.executedTransfer

    const executionConditionFulfillment = this.invalidExecutionConditionFulfillment

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(executionConditionFulfillment)
      .expect(422)
      .end()
  })
})

describe('PUT /fulfillment', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    this.proposedTransfer = _.cloneDeep(require('./data/transfers/proposed'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.invalidTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.transferWithAndConditionType = _.cloneDeep(require('./data/transfers/withAndCondition'))
    this.executionConditionFulfillmentTypeAnd = _.cloneDeep(require('./data/fulfillments/executionTypeAnd'))

    this.executionConditionFulfillment = _.cloneDeep(require('./data/fulfillments/execution'))
    this.cancellationConditionFulfillment = _.cloneDeep(require('./data/fulfillments/cancellation'))

    yield dbHelper.addAccounts(_.values(accounts))
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 404 when fulfilling a non-existent transfer', function * () {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(404)
      .end()
  })

  it('should not cancel an optimistic transfer', function * () {
    const transfer = this.preparedTransfer
    delete transfer.execution_condition
    delete transfer.cancellation_condition

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(10)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.cancellationConditionFulfillment)
      .expect(422)
      .expect({
        id: 'TransferNotConditionalError',
        message: 'Transfer is not conditional'
      })
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(10)
  })

  it('should set the state to "rejected" if and only if the ' +
    'cancellation_condition_fulfillment is present',
    function * () {
      const transfer = this.preparedTransfer

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      // Invalid fulfillment
      const invalidCancellationConditionFulfillment = 'cf:0:Y2FvY2Vs'
      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(invalidCancellationConditionFulfillment)
        .expect(422)
        .expect({
          id: 'UnmetConditionError',
          message: 'Fulfillment does not match any condition'
        })
        .end()

      // Check balances
      expect((yield getAccount('alice')).balance).to.equal(90)
      expect((yield getAccount('bob')).balance).to.equal(0)

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.cancellationConditionFulfillment)
        .expect(201)
        .expect(this.cancellationConditionFulfillment)
        .expect(validator.validateFulfillment)
        .end()

      // Check balances
      expect((yield getAccount('alice')).balance).to.equal(100)
      expect((yield getAccount('bob')).balance).to.equal(0)
    })

  /* Execution conditions */
  it('should update the state from "prepared" to "executed" ' +
  'when the execution criteria is met',
    function * () {
      const transfer = this.preparedTransfer

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.executionConditionFulfillment)
        .expect(201)
        .expect(this.executionConditionFulfillment)
        .expect(validator.validateFulfillment)
        .end()

      // Check balances
      expect((yield getAccount('alice')).balance).to.equal(90)
      expect((yield getAccount('bob')).balance).to.equal(10)
    })

  it('should execute when the condition is type "and"',
    function * () {
      const transfer = this.transferWithAndConditionType

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.executionConditionFulfillmentTypeAnd)
        .expect(201)
        .expect(this.executionConditionFulfillmentTypeAnd)
        .expect(validator.validateFulfillment)
        .end()

      // Check balances
      expect((yield getAccount('alice')).balance).to.equal(90)
      expect((yield getAccount('bob')).balance).to.equal(10)
    })

  it('should not double spend when transfer is executed multiple times', function * () {
    const transfer = this.executedTransfer

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .expect(validator.validateFulfillment)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(10)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(200)
      .expect(this.executionConditionFulfillment)
      .expect(validator.validateFulfillment)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(10)
  })

  it('should not allow a transfer to be cancelled multiple times', function * () {
    const transfer = this.preparedTransfer

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.cancellationConditionFulfillment)
      .expect(201)
      .expect(this.cancellationConditionFulfillment)
      .expect(validator.validateFulfillment)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(100)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.cancellationConditionFulfillment)
      .expect(422)
      .expect({
        id: 'AlreadyRolledBackError',
        message: 'This transfer has already been rejected'
      })
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(100)
    expect((yield getAccount('bob')).balance).to.equal(0)
  })
})
