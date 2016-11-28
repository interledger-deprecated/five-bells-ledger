'use strict'

const _ = require('lodash')
const assert = require('assert')
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

  describe('GET /websocket method:subscribe_account', function () {
    beforeEach(function * () {
      this.socket = this.ws('http://localhost/websocket', {
        headers: {
          Authorization: 'Basic ' + new Buffer('alice:alice', 'utf8').toString('base64')
        }
      })

      // Wait until WS connection is established
      yield new Promise((resolve) => {
        this.socket.once('message', (msg) => {
          assert.deepEqual(JSON.parse(msg), { jsonrpc: '2.0', id: null, method: 'connect' })
          resolve()
        })
      })

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'subscribe_account',
        params: {
          eventType: '*',
          accounts: ['http://localhost/accounts/alice']
        }
      }))

      yield new Promise((resolve) => {
        this.socket.once('message', (msg) => {
          assert.deepEqual(JSON.parse(msg), { jsonrpc: '2.0', id: 1, result: 1 })
          resolve()
        })
      })
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

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.update',
          resource: _.assign({}, transfer, {
            state: 'executed',
            timeline: {
              proposed_at: '2015-06-16T00:00:00.000Z',
              prepared_at: '2015-06-16T00:00:00.000Z',
              executed_at: '2015-06-16T00:00:00.000Z'
            }
          })
        }
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

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.create',
          resource: _.assign({}, transfer, {
            state: 'prepared',
            timeline: {
              proposed_at: '2015-06-16T00:00:00.000Z',
              prepared_at: '2015-06-16T00:00:00.000Z'
            }
          })
        }
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

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.secondCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.update',
          resource: _.assign({}, transfer, {
            state: 'executed',
            timeline: {
              proposed_at: '2015-06-16T00:00:00.000Z',
              prepared_at: '2015-06-16T00:00:00.000Z',
              executed_at: '2015-06-16T00:00:00.500Z'
            }
          })
        }
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

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.update',
          resource: _.assign({}, transfer, {
            state: 'proposed',
            timeline: {
              proposed_at: '2015-06-16T00:00:00.000Z'
            }
          })
        }
      })
      this.clock.tick(1000)

      // In production this function should be triggered by the workers started in app.js
      yield transferExpiryMonitor.processExpiredTransfers()

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.secondCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.update',
          resource: _.assign({}, transfer, {
            state: 'rejected',
            timeline: {
              proposed_at: '2015-06-16T00:00:00.000Z',
              rejected_at: '2015-06-16T00:00:01.000Z'
            }
          })
        }
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

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.create',
          resource: transferPrepared
        }
      })
      sinon.assert.calledWithMatch(listener.secondCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.update',
          resource: transferExecuted,
          related_resources: { execution_condition_fulfillment: this.executionConditionFulfillment }
        }
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

      sinon.assert.calledTwice(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.create',
          resource: transferPrepared
        }
      })
      sinon.assert.calledWithMatch(listener.secondCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.update',
          resource: transferCancelled
        }
      })
    })

    it('unsubscribes when passed an empty array of accounts', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'subscribe_account',
        params: { eventType: '*', accounts: [] }
      }))

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

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {jsonrpc: '2.0', id: 2, result: 0})
    })

    it('supports transfer.*', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'subscribe_account',
        params: { eventType: 'transfer.*', accounts: ['http://localhost/accounts/alice'] }
      }))
      yield new Promise((resolve) => {
        this.socket.once('message', (msg) => { resolve() })
      })

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
      sinon.assert.calledWithMatch(listener.firstCall, {jsonrpc: '2.0', id: 2, result: 1})
      sinon.assert.calledWithMatch(listener.secondCall, {
        jsonrpc: '2.0',
        id: null,
        method: 'notify',
        params: {
          event: 'transfer.update',
          resource: transfer
        }
      })
    })

    it('gets a 40000 when subscribing with a null id', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        method: 'subscribe_account',
        params: { eventType: '*', accounts: ['http://localhost/accounts/alice'] }
      }))

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: 40000,
          message: 'RpcError: Invalid id',
          data: {
            name: 'RpcError',
            message: 'Invalid id'
          }
        }
      })
    })

    it('gets a 40002 when subscribing to an invalid account', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'subscribe_account',
        params: { eventType: '*', accounts: ['foo'] }
      }))

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: 40002,
          message: 'RpcError: Invalid account: foo',
          data: {
            name: 'RpcError',
            message: 'Invalid account: foo'
          }
        }
      })
    })

    it('gets a -32602 when subscribing with invalid parameters', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'subscribe_account',
        params: { eventType: '*', accounts: 'foo' }
      }))

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32602,
          message: 'RpcError: Invalid params',
          data: {
            name: 'RpcError',
            message: 'Invalid params'
          }
        }
      })
    })

    it('gets a 40300 when subscribing to an account without permission', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'subscribe_account',
        params: { eventType: '*', accounts: ['http://localhost/accounts/bob'] }
      }))

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: 40300,
          message: 'RpcError: Not authorized',
          data: {
            name: 'RpcError',
            message: 'Not authorized'
          }
        }
      })
    })
  })

  describe('GET /websocket?token=...', function () {
    beforeEach(function * () {
      const tokenRes = yield this.request()
        .get('/auth_token')
        .auth('alice', 'alice')
        .expect(200)
        .end()
      this.token = tokenRes.body.token
    })

    it('connects the websocket if a valid token is passed', function * () {
      this.socket = this.ws('http://localhost/websocket?token=' + encodeURIComponent(this.token), {})

      // Wait until WS connection is established
      yield new Promise((resolve) => {
        this.socket.once('message', (msg) => {
          assert.deepEqual(JSON.parse(msg), { jsonrpc: '2.0', id: null, method: 'connect' })
          resolve()
        })
      })
    })

    it('closes the websocket if an invalid token is passed', function (done) {
      this.socket = this.ws('http://localhost/websocket?token=foo', {})
      this.socket.on('close', () => done())
    })
  })

  describe('GET /websocket errors', function () {
    beforeEach(function * () {
      this.socket = this.ws('http://localhost/websocket', {
        headers: {
          Authorization: 'Basic ' + new Buffer('admin:admin', 'utf8').toString('base64')
        }
      })

      // Wait until WS connection is established
      yield new Promise((resolve) => {
        this.socket.once('message', (msg) => {
          assert.deepEqual(JSON.parse(msg), { jsonrpc: '2.0', id: null, method: 'connect' })
          resolve()
        })
      })
    })

    afterEach(function * () {
      this.socket.terminate()
    })

    it('gets a -32601 when using an invalid method', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'foo'
      }))

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(50)

      sinon.assert.calledOnce(listener)
      sinon.assert.calledWithMatch(listener.firstCall, {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32601,
          message: 'RpcError: Unknown method: foo',
          data: {
            name: 'RpcError',
            message: 'Unknown method: foo'
          }
        }
      })
    })

    it('ignores an oversized payload', function * () {
      const listener = sinon.spy()
      this.socket.on('message', (msg) => listener(JSON.parse(msg)))

      const payload = new Buffer(64 * 1024)
      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'foo',
        params: {bar: payload.toString()}
      }))

      // TODO: Is there a more elegant way?
      yield timingHelper.sleep(250)

      assert.equal(listener.callCount, 0)
    })
  })
})
