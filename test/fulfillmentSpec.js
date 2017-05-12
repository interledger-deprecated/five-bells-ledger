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

  before(async function () {
    await dbHelper.init()
  })

  beforeEach(async function () {
    appHelper.create(this, app)
    await dbHelper.clean()
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

    await dbHelper.addAccounts(_.values(accounts))
    await dbHelper.addTransfers([this.proposedTransfer, this.preparedTransfer, this.executedTransfer])
  })

  afterEach(async function () {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 401 if the request is not authenticated', async function () {
    await this.request()
        .get(this.executedTransfer.id + '/fulfillment')
        .expect(401)
  })

  /* GET fulfillments */
  it('should return 404 for fulfillment when given an invalid transfer id', async function () {
    await this.request()
      .get(this.invalidTransfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(404)
      .expect({
        id: 'TransferNotFoundError',
        message: 'This transfer does not exist'
      })
  })

  it('should return 404 if the transfer has no fulfillment', async function () {
    const transfer = this.proposedTransfer
    await this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(404)
      .expect({
        id: 'MissingFulfillmentError',
        message: 'This transfer has not yet been fulfilled'
      })
  })

  it('should return a 422 if the transfer has already expired', async function () {
    const transfer = this.transferWithExpiry
    transfer.execution_condition = this.preparedTransfer.execution_condition
    await this.request()
      .put(transfer.id)
      .auth('admin', 'admin')
      .send(transfer)

    this.clock.tick(10000000)

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .send(this.executionConditionFulfillment)
      .expect(422)
      .expect({
        id: 'ExpiredTransferError',
        message: 'Cannot modify transfer after expires_at date'
      })
  })

  it('should return AlreadyRolledBackError if the transfer is rejected', async function () {
    const transfer = Object.assign(this.proposedTransfer, {
      id: 'http://localhost/transfers/25644640-d140-450e-b94b-badbe23d3382',
      state: 'rejected'
    })
    await dbHelper.addTransfers([transfer])
    await this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(422)
      .expect({
        id: 'AlreadyRolledBackError',
        message: 'This transfer has already been rejected'
      })
  })

  it('should return TransferNotConditionalError for an optimistic transfer', async function () {
    const transfer = Object.assign(this.proposedTransfer, {
      id: 'http://localhost/transfers/25644640-d140-450e-b94b-badbe23d3381',
      execution_condition: undefined,
      cancellation_condition: undefined
    })
    await dbHelper.addTransfers([transfer])
    await this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(422)
      .expect({
        id: 'TransferNotConditionalError',
        message: 'Transfer does not have any conditions'
      })
  })

  it('should return 404 if the transfer has no fulfillment and has already expired', async function () {
    const transfer = Object.assign(this.proposedTransfer, {
      id: 'http://localhost/transfers/25644640-d140-450e-b94b-badbe23d3380',
      expires_at: (new Date(Date.now() - 1)).toISOString()
    })
    await dbHelper.addTransfers([transfer])
    await this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(404)
      .expect({
        id: 'MissingFulfillmentError',
        message: 'This transfer expired before it was fulfilled'
      })
  })

  async function returnFulfillment () {
    const transfer = this.preparedTransfer

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .send(this.executionConditionFulfillment)
      .expect(201)
      .expect(this.executionConditionFulfillment)
      .expect(validator.validateFulfillment)

    await this.request()
      .get(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .expect(200)
      .expect(this.executionConditionFulfillment)
      .expect(validator.validateFulfillment)
  }

  it('should return a fulfillment', returnFulfillment)

  /* put fulfillments */
  /* Fulfillment errors */
  it('should return 400 if a valid execution condition is given to an unauthorized transfer', async function () {
    const transfer = this.proposedTransfer

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .send(this.executionConditionFulfillment)
      .expect(400)
  })

  it('should return 400 if a valid cancellation condition is given for an executed transfer', async function () {
    const transfer = this.executedTransfer

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .send(this.cancellationConditionFulfillment)
      .expect(400)
  })

  it('should return 422 if the signature is invalid', async function () {
    const transfer = this.executedTransfer

    const executionConditionFulfillment = this.invalidExecutionConditionFulfillment

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .send(executionConditionFulfillment)
      .expect(422)
  })
})

describe('PUT /fulfillment', function () {
  logHelper(logger)

  before(async function () {
    await dbHelper.init()
  })

  beforeEach(async function () {
    appHelper.create(this, app)
    await dbHelper.clean()
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    this.proposedTransfer = _.cloneDeep(require('./data/transfers/proposed'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.invalidTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.transferWithAndConditionType = _.cloneDeep(require('./data/transfers/withAndCondition'))
    this.executionConditionFulfillmentTypeAnd = _.cloneDeep(require('./data/fulfillments/executionTypeAnd'))

    this.executionConditionFulfillment = _.cloneDeep(require('./data/fulfillments/execution'))
    this.cancellationConditionFulfillment = _.cloneDeep(require('./data/fulfillments/cancellation'))

    await dbHelper.addAccounts(_.values(accounts))
  })

  afterEach(async function () {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 401 if the request is not authenticated', async function () {
    await this.request()
      .put(this.preparedTransfer.id + '/fulfillment')
      .expect(401)
  })

  it('should return 404 when fulfilling a non-existent transfer', async function () {
    const transfer = this.preparedTransfer
    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('admin', 'admin')
      .send(this.executionConditionFulfillment)
      .expect(404)
  })

  it('should not cancel an optimistic transfer', async function () {
    const transfer = this.preparedTransfer
    delete transfer.execution_condition
    delete transfer.cancellation_condition
    delete transfer.state

    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)

    // Check balances
    expect((await getAccount('alice')).balance).to.equal(90)
    expect((await getAccount('bob')).balance).to.equal(10)

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.cancellationConditionFulfillment)
      .expect(422)
      .expect({
        id: 'TransferNotConditionalError',
        message: 'Transfer is not conditional'
      })

    // Check balances
    expect((await getAccount('alice')).balance).to.equal(90)
    expect((await getAccount('bob')).balance).to.equal(10)
  })

  it('should set the state to "rejected" if and only if the ' +
    'cancellation_condition_fulfillment is present',
    async function () {
      const transfer = this.preparedTransfer

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      // Invalid fulfillment
      const invalidCancellationConditionFulfillment = 'oAiABp6LXGp3Hg'
      await this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(invalidCancellationConditionFulfillment)
        .expect(422)
        .expect({
          id: 'UnmetConditionError',
          message: 'Fulfillment does not match any condition'
        })

      // Check balances
      expect((await getAccount('alice')).balance).to.equal(90)
      expect((await getAccount('bob')).balance).to.equal(0)

      await this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.cancellationConditionFulfillment)
        .expect(201)
        .expect(this.cancellationConditionFulfillment)
        .expect(validator.validateFulfillment)

      // Check balances
      expect((await getAccount('alice')).balance).to.equal(100)
      expect((await getAccount('bob')).balance).to.equal(0)
    })

  /* Execution conditions */
  it('should update the state from "prepared" to "executed" ' +
  'when the execution criteria is met',
    async function () {
      const transfer = this.preparedTransfer

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      await this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.executionConditionFulfillment)
        .expect(201)
        .expect(this.executionConditionFulfillment)
        .expect(validator.validateFulfillment)

      // Check balances
      expect((await getAccount('alice')).balance).to.equal(90)
      expect((await getAccount('bob')).balance).to.equal(10)
    })

  it('should execute when the condition is type "and"',
    async function () {
      const transfer = this.transferWithAndConditionType

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      await this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.executionConditionFulfillmentTypeAnd)
        .expect(201)
        .expect(this.executionConditionFulfillmentTypeAnd)
        .expect(validator.validateFulfillment)

      // Check balances
      expect((await getAccount('alice')).balance).to.equal(90)
      expect((await getAccount('bob')).balance).to.equal(10)
    })

  it('should not double spend when transfer is executed multiple times', async function () {
    const transfer = this.executedTransfer

    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)

    const validateResponse = (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error('Unexpected status code ' + res.statusCode)
      }
    }

    // Send three concurrent fulfillment requests
    await Promise.all([
      this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.executionConditionFulfillment)
        .expect(validateResponse),
      this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.executionConditionFulfillment)
        .expect(validateResponse),
      this.request()
        .put(transfer.id + '/fulfillment')
        .auth('alice', 'alice')
        .send(this.executionConditionFulfillment)
        .expect(validateResponse)
    ])

    // Check balances
    const senderAccount = await getAccount('alice')
    const receiverAccount = await getAccount('bob')

    expect(senderAccount.balance).to.equal(90)
    expect(receiverAccount.balance).to.equal(10)
  })

  it('should not allow a transfer to be cancelled multiple times', async function () {
    const transfer = this.preparedTransfer

    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.cancellationConditionFulfillment)
      .expect(201)
      .expect(this.cancellationConditionFulfillment)
      .expect(validator.validateFulfillment)

    // Check balances
    expect((await getAccount('alice')).balance).to.equal(100)
    expect((await getAccount('bob')).balance).to.equal(0)

    await this.request()
      .put(transfer.id + '/fulfillment')
      .auth('alice', 'alice')
      .send(this.cancellationConditionFulfillment)
      .expect(422)
      .expect({
        id: 'AlreadyRolledBackError',
        message: 'This transfer has already been rejected'
      })

    // Check balances
    expect((await getAccount('alice')).balance).to.equal(100)
    expect((await getAccount('bob')).balance).to.equal(0)
  })
})
