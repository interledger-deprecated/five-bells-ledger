/*global describe, it*/
'use strict'
const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../src/services/app')
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')
const sinon = require('sinon')
const accounts = require('./data/accounts')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Transfer fulfillment', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date', 'setTimeout', 'setImmediate')

    this.proposedTransfer = _.cloneDeep(require('./data/transfers/transferProposed'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/transferPrepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/transferExecuted'))
    this.invalidTransfer = _.cloneDeep(require('./data/transfers/transferSimple'))

    this.executionConditionFulfillment = _.cloneDeep(require('./data/transfers/executionConditionFulfillment'))
    this.cancellationConditionFulfillment = _.cloneDeep(require('./data/transfers/cancellationConditionFulfillment'))

    // Reset database
    yield dbHelper.reset()

    yield dbHelper.addAccounts(_.values(accounts))
    yield dbHelper.addTransfers([this.proposedTransfer, this.preparedTransfer, this.executedTransfer])
  })

  afterEach(function *() {
    nock.cleanAll()
    this.clock.restore()
  })

  /* GET fulfillments */
  it('should return 404 for fulfillment when given an invalid transfer id', function *() {
    yield this.request()
      .get(this.invalidTransfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .expect(404)
      .end()
  })

  it('should return 404 if the transfer has no fulfillment', function *() {
    const transfer = this.proposedTransfer
    yield this.request()
      .get(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .expect(404)
      .end()
  })

  it('should return a fulfillment', function *() {
    const transfer = this.preparedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .end()

    yield this.request()
      .get(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .expect(200)
      .expect(this.executionConditionFulfillment)
      .end()
  })

  /* PUT fulfillments */
  /* Fulfillment errors */
  it('should return 400 if a valid execution condition is given to an unauthorized transfer', function *() {
    const transfer = this.proposedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('candice', 'candice')
      .send(this.executionConditionFulfillment)
      .expect(400)
      .end()
  })

  it('should return 400 if a valid cancellation condition is given for an executed transfer', function *() {
    const transfer = this.executedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.cancellationConditionFulfillment)
      .expect(400)
      .end()
  })

  it('should return 422 if the signature is invalid', function *() {
    const transfer = this.executedTransfer

    const executionConditionFulfillment = _.cloneDeep(this.executionConditionFulfillment)
    executionConditionFulfillment.signature = 'aW52YWxpZA=='

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(executionConditionFulfillment)
      .expect(422)
      .end()
  })

  it('should set the state to "rejected" if and only if the ' +
    'cancellation_condition_fulfillment is present',
    function *() {
      const transfer = this.preparedTransfer

      // Invalid fulfillment
      const invalidCancellationConditionFulfillment = {
        'type': 'sha256',
        'message': 'please cancel this transfer'
      }
      yield this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(invalidCancellationConditionFulfillment)
        .expect(422)
        .expect({
          id: 'UnmetConditionError',
          message: 'ConditionFulfillment failed'
        })
        .end()

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.cancellationConditionFulfillment)
        .expect(201)
        .expect(this.cancellationConditionFulfillment)
        .end()
    })

  /* Execution conditions */
  it('should update the state from "prepared" to "executed" ' +
  'when the execution criteria is met',
    function *() {
      const transfer = this.preparedTransfer

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.executionConditionFulfillment)
        .expect(201)
        .expect(this.executionConditionFulfillment)
        .end()
    })

  /* Idempotency of fulfillment */
  it('should allow a transfer to be fulfilled (executed) multiple times', function *() {
    const transfer = this.executedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .end()

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.executionConditionFulfillment)
      .expect(200)
      .expect(this.executionConditionFulfillment)
      .end()
  })

  it('should allow a transfer to be fulfilled (cancelled) multiple times', function *() {
    const transfer = this.preparedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.cancellationConditionFulfillment)
      .expect(201)
      .expect(this.cancellationConditionFulfillment)
      .end()

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.cancellationConditionFulfillment)
      .expect(200)
      .expect(this.cancellationConditionFulfillment)
      .end()
  })
})
