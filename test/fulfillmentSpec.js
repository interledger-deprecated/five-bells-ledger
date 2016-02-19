/*global describe, it*/
'use strict'
const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const expect = require('chai').expect
const app = require('../src/services/app')
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')
const sinon = require('sinon')
const accounts = require('./data/accounts')
const Account = require('../src/models/db/account').Account
const Subscription = require('../src/models/db/subscription').Subscription
const fulfillmentValidator = require('../src/services/validator').create('ConditionFulfillment')
const transferValidator = require('../src/services/validator').create('Transfer')
const notificationValidator = require('../src/services/validator').create('Notification')

function validateFulfillment (res) {
  const validatorResult = fulfillmentValidator(res.body)
  if (!validatorResult.valid) {
    throw new Error('Fulfillment schema validation error: ' + JSON.stringify(_.omit(validatorResult.errors[0], ['stack'])))
  }
}

function validateTransfer (res) {
  const validatorResult = transferValidator(res.body)
  if (!validatorResult.valid) {
    throw new Error('Transfer schema validation error: ' + JSON.stringify(_.omit(validatorResult.errors[0], ['stack'])))
  }
}

function validateNotification (body) {
  const validatorResult = notificationValidator(body)
  if (!validatorResult.valid) {
    throw new Error('Notification schema validation error: ' + JSON.stringify(_.omit(validatorResult.errors[0], ['stack'])))
  }
}

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('GET /fulfillment', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date', 'setTimeout', 'setImmediate')

    this.proposedTransfer = _.cloneDeep(require('./data/transfers/proposed'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.invalidTransfer = _.cloneDeep(require('./data/transfers/simple'))

    this.executionConditionFulfillment = _.cloneDeep(require('./data/fulfillments/execution'))
    this.cancellationConditionFulfillment = _.cloneDeep(require('./data/fulfillments/cancellation'))

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
      .expect(404)
      .end()
  })

  it('should return 404 if the transfer has no fulfillment', function *() {
    const transfer = this.proposedTransfer
    yield this.request()
      .get(transfer.id + '/fulfillment')
      .expect(404)
      .end()
  })

  it('should return a fulfillment', function *() {
    const transfer = this.preparedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .expect(validateFulfillment)
      .end()

    yield this.request()
      .get(transfer.id + '/fulfillment')
      .expect(200)
      .expect(this.executionConditionFulfillment)
      .expect(validateFulfillment)
      .end()
  })

  /* put fulfillments */
  /* Fulfillment errors */
  it('should return 400 if a valid execution condition is given to an unauthorized transfer', function *() {
    const transfer = this.proposedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(400)
      .end()
  })

  it('should return 400 if a valid cancellation condition is given for an executed transfer', function *() {
    const transfer = this.executedTransfer

    yield this.request()
      .put(transfer.id + '/fulfillment')
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
      .send(executionConditionFulfillment)
      .expect(422)
      .end()
  })
})

describe('PUT /fulfillment', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date', 'setTimeout', 'setImmediate')

    this.proposedTransfer = _.cloneDeep(require('./data/transfers/proposed'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.invalidTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.transferWithAndConditionType = _.cloneDeep(require('./data/transfers/withAndCondition'))
    this.executionConditionFulfillmentTypeAnd = _.cloneDeep(require('./data/fulfillments/executionTypeAnd'))

    this.executionConditionFulfillment = _.cloneDeep(require('./data/fulfillments/execution'))
    this.cancellationConditionFulfillment = _.cloneDeep(require('./data/fulfillments/cancellation'))

    // Reset database
    yield dbHelper.reset()

    yield dbHelper.addAccounts(_.values(accounts))
  })

  afterEach(function *() {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 404 when fulfilling a non-existent transfer', function *() {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(404)
      .end()
  })

  it('should set the state to "rejected" if and only if the ' +
    'cancellation_condition_fulfillment is present',
    function *() {
      const transfer = this.preparedTransfer

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validateTransfer)
        .end()

      // Invalid fulfillment
      const invalidCancellationConditionFulfillment = {
        'type': 'sha256',
        'message': 'please cancel this transfer'
      }
      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(invalidCancellationConditionFulfillment)
        .expect(422)
        .expect({
          id: 'UnmetConditionError',
          message: 'ConditionFulfillment failed'
        })
        .end()

      // Check balances
      expect((yield Account.findByName('alice')).balance).to.equal(90)
      expect((yield Account.findByName('bob')).balance).to.equal(0)

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.cancellationConditionFulfillment)
        .expect(201)
        .expect(this.cancellationConditionFulfillment)
        .expect(validateFulfillment)
        .end()

      // Check balances
      expect((yield Account.findByName('alice')).balance).to.equal(100)
      expect((yield Account.findByName('bob')).balance).to.equal(0)
    })

  /* Execution conditions */
  it('should update the state from "prepared" to "executed" ' +
  'when the execution criteria is met',
    function *() {
      const transfer = this.preparedTransfer

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validateTransfer)
        .end()

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.executionConditionFulfillment)
        .expect(201)
        .expect(this.executionConditionFulfillment)
        .expect(validateFulfillment)
        .end()

      // Check balances
      expect((yield Account.findByName('alice')).balance).to.equal(90)
      expect((yield Account.findByName('bob')).balance).to.equal(10)
    })

  it('should execute when the condition is type "and"',
    function *() {
      const transfer = this.transferWithAndConditionType

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validateTransfer)
        .end()

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.executionConditionFulfillmentTypeAnd)
        .expect(201)
        .expect(this.executionConditionFulfillmentTypeAnd)
        .expect(validateFulfillment)
        .end()

      // Check balances
      expect((yield Account.findByName('alice')).balance).to.equal(90)
      expect((yield Account.findByName('bob')).balance).to.equal(10)
    })

  it('should not double spend when transfer is executed multiple times', function *() {
    const transfer = this.executedTransfer

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validateTransfer)
      .end()

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .expect(validateFulfillment)
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(90)
    expect((yield Account.findByName('bob')).balance).to.equal(10)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(200)
      .expect(this.executionConditionFulfillment)
      .expect(validateFulfillment)
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(90)
    expect((yield Account.findByName('bob')).balance).to.equal(10)
  })

  it('should allow a transfer to be cancelled multiple times', function *() {
    const transfer = this.preparedTransfer

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validateTransfer)
      .end()

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.cancellationConditionFulfillment)
      .expect(201)
      .expect(this.cancellationConditionFulfillment)
      .expect(validateFulfillment)
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(100)
    expect((yield Account.findByName('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.cancellationConditionFulfillment)
      .expect(200)
      .expect(this.cancellationConditionFulfillment)
      .expect(validateFulfillment)
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(100)
    expect((yield Account.findByName('bob')).balance).to.equal(0)
  })

  it('should trigger subscriptions when notification is executed', function *() {
    const subscription = require('./data/subscription1.json')
    yield Subscription.fromDataExternal(subscription).create()

    const transfer = this.preparedTransfer
    const transferPrepared = _.assign({}, transfer, {
      timeline: {
        prepared_at: '2015-06-16T00:00:00.000Z',
        proposed_at: '2015-06-16T00:00:00.000Z'
      }
    })

    // Expect notification that transfer was prepared
    const notificationPrepared = nock('http://subscriber.example')
      .post('/notifications', (body) => {
        const idParts = body.id.split('/')
        const notificationId = idParts[idParts.length - 1]
        expect(body).to.deep.equal({
          event: 'transfer.update',
          id: subscription.id + '/notifications/' + notificationId,
          subscription: subscription.id,
          resource: transferPrepared
        })
        expect(validateNotification.bind(validateNotification, body)).to.not.throw(Error)
        return true
      })
      .reply(204)

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(transferPrepared)
      .expect(validateTransfer)
      .end()

    notificationPrepared.done()

    const transferExecuted = _.assign({}, transfer, {
      state: 'executed',
      timeline: {
        executed_at: '2015-06-16T00:00:00.000Z',
        prepared_at: '2015-06-16T00:00:00.000Z',
        proposed_at: '2015-06-16T00:00:00.000Z'
      }
    })
    // Expect notification that transfer was executed
    const notificationExecuted = nock('http://subscriber.example')
      .post('/notifications', (body) => {
        const idParts = body.id.split('/')
        const notificationId = idParts[idParts.length - 1]
        expect(body).to.deep.equal({
          event: 'transfer.update',
          id: subscription.id + '/notifications/' + notificationId,
          subscription: subscription.id,
          resource: transferExecuted,
          related_resources: {
            execution_condition_fulfillment: this.executionConditionFulfillment
          }
        })
        expect(validateNotification.bind(validateNotification, body)).to.not.throw(Error)
        return true
      })
      .reply(204)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .expect(validateFulfillment)
      .end()

    notificationExecuted.done()
  })

  it('should trigger subscriptions when notification is cancelled', function *() {
    const subscription = require('./data/subscription1.json')
    yield Subscription.fromDataExternal(subscription).create()

    const transfer = this.preparedTransfer
    const transferPrepared = _.assign({}, transfer, {
      timeline: {
        prepared_at: '2015-06-16T00:00:00.000Z',
        proposed_at: '2015-06-16T00:00:00.000Z'
      }
    })

    // Expect notification that transfer was prepared
    const notificationPrepared = nock('http://subscriber.example')
      .post('/notifications', (body) => {
        const idParts = body.id.split('/')
        const notificationId = idParts[idParts.length - 1]
        expect(body).to.deep.equal({
          event: 'transfer.update',
          id: subscription.id + '/notifications/' + notificationId,
          subscription: subscription.id,
          resource: transferPrepared
        })
        expect(validateNotification.bind(validateNotification, body)).to.not.throw(Error)
        return true
      })
      .reply(204)

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(transferPrepared)
      .expect(validateTransfer)
      .end()

    notificationPrepared.done()

    const transferCancelled = _.assign({}, transfer, {
      state: 'rejected',
      rejection_reason: 'cancelled',
      timeline: {
        rejected_at: '2015-06-16T00:00:00.000Z',
        prepared_at: '2015-06-16T00:00:00.000Z',
        proposed_at: '2015-06-16T00:00:00.000Z'
      }
    })
    // Expect notification that transfer was rejected
    const notificationCancelled = nock('http://subscriber.example')
      .post('/notifications', (body) => {
        const idParts = body.id.split('/')
        const notificationId = idParts[idParts.length - 1]
        expect(body).to.deep.equal({
          event: 'transfer.update',
          id: subscription.id + '/notifications/' + notificationId,
          subscription: subscription.id,
          resource: transferCancelled,
          related_resources: {
            cancellation_condition_fulfillment: this.cancellationConditionFulfillment
          }
        })
        expect(validateNotification.bind(validateNotification, body)).to.not.throw(Error)
        return true
      })
      .reply(204)

    yield this.request()
      .put(transfer.id + '/fulfillment')
      .send(this.cancellationConditionFulfillment)
      .expect(201)
      .expect(this.cancellationConditionFulfillment)
      .end()

    notificationCancelled.done()
  })
})
