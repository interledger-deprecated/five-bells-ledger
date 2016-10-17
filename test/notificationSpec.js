/*global describe, it*/
'use strict'

const _ = require('lodash')
const sinon = require('sinon')
const app = require('../src/services/app')
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const timingHelper = require('./helpers/timing')
const logHelper = require('./helpers/log')
const transferExpiryMonitor = require('../src/services/transferExpiryMonitor')
const transferDictionary = require('five-bells-shared').TransferStateDictionary
const transferStates = transferDictionary.transferStates

const validator = require('./helpers/validator')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Notifications', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleAccounts = _.cloneDeep(require('./data/accounts'))
    this.adminAccount = this.exampleAccounts.admin
    this.holdAccount = this.exampleAccounts.hold
    this.existingAccount = this.exampleAccounts.alice
    this.existingAccount2 = this.exampleAccounts.bob
    this.traderAccount = this.exampleAccounts.trader
    this.disabledAccount = this.exampleAccounts.disabledAccount
    this.infiniteMinBalance = this.exampleAccounts.infiniteMinBalance
    this.finiteMinBalance = this.exampleAccounts.finiteMinBalance
    this.unspecifiedMinBalance = this.exampleAccounts.unspecifiedMinBalance
    this.noBalance = this.exampleAccounts.noBalance

    this.transfer = _.cloneDeep(require('./data/transfers/simple'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/simpleWithExpiry'))
    this.fulfillment = require('./data/fulfillments/execution')

    this.executionConditionFulfillment = _.cloneDeep(require('./data/fulfillments/execution'))
    this.cancellationConditionFulfillment = _.cloneDeep(require('./data/fulfillments/cancellation'))

    // Store some example data
    yield dbHelper.addAccounts([
      this.adminAccount,
      this.holdAccount,
      this.existingAccount,
      this.existingAccount2,
      this.traderAccount,
      this.disabledAccount
    ])
  })

  describe('GET /accounts/:id/transfers (websocket)', function () {
    beforeEach(function * () {
      const account = 'http://localhost/accounts/alice'
      this.socket = this.ws(account + '/transfers', {
        headers: {
          Authorization: 'Basic ' + new Buffer('alice:alice', 'utf8').toString('base64')
        }
      })

      // Wait until WS connection is established
      yield new Promise((resolve) => this.socket.on('open', resolve))
    })

    afterEach(function * () {
      this.socket.terminate()
    })

    it('should send notifications about simple transfers', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      const transfer = this.transfer

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, { type: 'connect' })
      sinon.assert.calledWithMatch(listener.secondCall, {
        type: 'transfer',
        resource: _.assign({}, transfer, {
          state: 'executed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            executed_at: '2015-06-16T00:00:00.000Z'
          }
        })
      })
    })

    it('should not send notifications for wrong id', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      const transfer = this.transfer

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      const transferId = '6f5ab02c-01d2-4016-8816-df6f22b03d94' // a wrong id
      this.socket.send(JSON.stringify({ type: 'request_notification',
                                        id: transferId }))

      yield timingHelper.sleep(50)

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, { type: 'connect' })
      sinon.assert.calledWithMatch(listener.secondCall, {
        type: 'transfer',
        resource: _.assign({}, transfer, {
          state: 'executed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            executed_at: '2015-06-16T00:00:00.000Z'
          }
        })
      })
    })

    it('should send notifications about executed transfers', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      const transfer = this.transferWithExpiry
      const fulfillment = this.fulfillment

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, { type: 'connect' })
      sinon.assert.calledWithMatch(listener.secondCall, {
        type: 'transfer',
        resource: _.assign({}, transfer, {
          state: 'prepared',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z'
          }
        })
      })
      this.clock.tick(500)
      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(fulfillment)
        .expect(201)
        .end()

      // In production this function should be triggered by the workers started in app.js
      yield transferExpiryMonitor.processExpiredTransfers()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledThrice(listener)
      sinon.assert.calledWithMatch(listener.thirdCall, {
        type: 'transfer',
        resource: _.assign({}, transfer, {
          state: 'executed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            executed_at: '2015-06-16T00:00:00.500Z'
          }
        })
      })
    })

    it('should send notifications about rejected transfers', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      const transfer = this.transferWithExpiry
      delete transfer.debits[0].authorized

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.secondCall, {
        type: 'transfer',
        resource: _.assign({}, transfer, {
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        })
      })
      this.clock.tick(1000)

      // In production this function should be triggered by the workers started in app.js
      yield transferExpiryMonitor.processExpiredTransfers()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledThrice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, { type: 'connect' })
      sinon.assert.calledWithMatch(listener.thirdCall, {
        type: 'transfer',
        resource: _.assign({}, transfer, {
          state: 'rejected',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z',
            rejected_at: '2015-06-16T00:00:01.000Z'
          }
        })
      })
    })

    it('should check fulfillment condition in notification', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      const transfer = this.preparedTransfer
      const transferPrepared = _.assign({}, transfer, {
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z'
        }
      })

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(transferPrepared)
        .expect(validator.validateTransfer)
        .end()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      const transferExecuted = _.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      })

      yield timingHelper.sleep(50)

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.executionConditionFulfillment)
        .expect(201)
        .expect(this.executionConditionFulfillment)
        .end()

      yield timingHelper.sleep(50)

      sinon.assert.calledThrice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, { type: 'connect' })
      sinon.assert.calledWithMatch(listener.secondCall, {
        type: 'transfer',
        resource: transferPrepared
      })
      sinon.assert.calledWithMatch(listener.thirdCall, {
        type: 'transfer',
        resource: transferExecuted,
        related_resources: { execution_condition_fulfillment: this.executionConditionFulfillment }
      })
    })

    it('should check cancellation condition in notification', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      const transfer = this.preparedTransfer
      const transferPrepared = _.assign({}, transfer, {
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z'
        }
      })

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(transferPrepared)
        .expect(validator.validateTransfer)
        .end()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      const transferCancelled = _.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_REJECTED,
        rejection_reason: 'cancelled',
        timeline: {
          rejected_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      })

      yield timingHelper.sleep(50)

      yield this.request()
        .put(transfer.id + '/fulfillment')
        .send(this.cancellationConditionFulfillment)
        .expect(201)
        .expect(this.cancellationConditionFulfillment)
        .end()

      yield timingHelper.sleep(50)

      sinon.assert.calledThrice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, { type: 'connect' })
      sinon.assert.calledWithMatch(listener.secondCall, {
        type: 'transfer',
        resource: transferPrepared
      })
      sinon.assert.calledWithMatch(listener.thirdCall, {
        type: 'transfer',
        resource: transferCancelled
      })
    })
  })
})
