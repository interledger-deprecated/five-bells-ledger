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
const logHelper = require('./helpers/log')
const sinon = require('sinon')
const accounts = require('./data/accounts')
const validator = require('./helpers/validator')
const getAccount = require('../src/models/db/accounts').getAccount

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('PUT /rejection', function () {
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
    this.multiCreditTransfer = _.cloneDeep(require('./data/transfers/multiCredit'))

    yield dbHelper.addAccounts(_.values(accounts))
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 404 when rejecting a non-existent transfer', function * () {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send('error 1')
      .expect(404)
      .end()
  })

  it('should return 403 when rejecting a transfer as the wrong user', function * () {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('alice', 'alice')
      .send('error 1')
      .expect(403)
      .expect({
        id: 'UnauthorizedError',
        message: 'Invalid attempt to reject credit'
      })
      .end()
  })

  it('should reject a prepared transfer', function * () {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send('error 1')
      .expect(201)
      .expect('error 1')
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(100)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send('error 2')
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
      .end()

    yield this.request()
      .get(transfer.id)
      .expect(200)
      .expect(Object.assign(transfer, {
        state: 'rejected',
        rejection_reason: 'cancelled',
        credits: [
          Object.assign(transfer.credits[0], {
            rejected: true,
            rejection_message: (new Buffer('error 1')).toString('base64')
          })
        ],
        timeline: {
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z',
          rejected_at: '2015-06-16T00:00:00.000Z'
        }
      }))
  })

  it('rejects the transfer when all credits are rejected', function * () {
    const transfer = Object.assign(this.multiCreditTransfer,
      {execution_condition: 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'})
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(80)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('dave', 'dave')
      .send('error 1')
      .expect(201)
      .expect('error 1')
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(80)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send('error 2')
      .expect(201)
      .expect('error 2')
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(100)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .get(transfer.id)
      .expect(200)
      .expect(Object.assign(transfer, {
        state: 'rejected',
        rejection_reason: 'cancelled',
        credits: [
          Object.assign(transfer.credits[0], { // bob
            rejected: true,
            rejection_message: (new Buffer('error 2')).toString('base64')
          }),
          Object.assign(transfer.credits[1], { // dave
            rejected: true,
            rejection_message: (new Buffer('error 1')).toString('base64')
          })
        ],
        timeline: {
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z',
          rejected_at: '2015-06-16T00:00:00.000Z'
        }
      }))
  })
})
