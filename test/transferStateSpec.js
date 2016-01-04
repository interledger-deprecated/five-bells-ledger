/*global describe, it*/
'use strict'
const _ = require('lodash')
const sinon = require('sinon')
const app = require('../app')
const logger = require('../src/services/log')
const config = require('../src/services/config')
const transferExpiryMonitor = require('../src/services/transferExpiryMonitor')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')
const tweetnacl = require('tweetnacl')
const validate = require('five-bells-shared/services/validate')
const hashJSON = require('five-bells-shared/utils/hashJson')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Transfer State', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date', 'setTimeout', 'setImmediate')

    // Set up keys
    config.keys.ed25519 = {
      secret: 'iMx6i3D3acJPc4aJlK0iT/pkJP3T+Dqte9wg6hXpXEv08CpNQSm1J5AI6n/' +
        'QVBObeuQWdQVpgRQTAJzLLJJA/Q==',
      public: '9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0='
    }

    this.keyPair =
      tweetnacl.sign.keyPair.fromSecretKey(
        tweetnacl.util.decodeBase64(config.keys.ed25519.secret))

    // Define example data
    this.executedTransfer = _.cloneDeep(require('./data/transferExecuted'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transferWithExpiry'))

    // Reset database
    yield dbHelper.reset()

    // Store some example data
    yield dbHelper.addAccounts(_.values(require('./data/accounts')))
  })

  afterEach(function *() {
    this.clock.restore()
  })

  describe('GET /transfers/:uuid/state', function () {
    it('should return a 200 if the transfer does not exist', function *() {
      const stateReceipt = {
        id: 'http://localhost/transfers/03b7c787-e104-4390-934e-693072c6eda2',
        state: 'nonexistent'
      }
      const stateReceiptHash = hashJSON(stateReceipt)
      const signature = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(stateReceiptHash),
          this.keyPair.secretKey))

      yield this.request()
        .get('/transfers/03b7c787-e104-4390-934e-693072c6eda2/state')
        .expect(200, {
          message: stateReceipt,
          type: 'ed25519-sha512',
          signer: config.server.base_uri,
          public_key: config.keys.ed25519.public,
          signature: signature
        })
        .end()
    })

    it('returns 400 if the ?type parameter is invalid', function *() {
      yield this.request()
        .get(this.executedTransfer.id + '/state?type=bogus')
        .expect(400, {
          id: 'InvalidUriParameterError',
          message: 'type is not valid'
        })
        .end()
    })

    it('should return a 200 and a signed receipt including the message, ' +
      'messageHash, type, public_key, and signature', function *() {
      yield dbHelper.addTransfers([this.executedTransfer])

      const stateReceipt = {
        id: this.executedTransfer.id,
        state: this.executedTransfer.state
      }
      const stateReceiptHash = hashJSON(stateReceipt)
      const signature = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(stateReceiptHash),
          this.keyPair.secretKey))

      yield this.request()
        .get(this.executedTransfer.id + '/state')
        .expect(200, {
          message: stateReceipt,
          type: 'ed25519-sha512',
          signer: config.server.base_uri,
          public_key: config.keys.ed25519.public,
          signature: signature
        })
        .end()
    })

    it('should return the correct state if the transfer is prepared',
      function *() {
        const transfer = _.cloneDeep(this.executedTransfer)
        transfer.state = 'prepared'

        yield dbHelper.addTransfers([transfer])

        const stateReceipt = {
          id: transfer.id,
          state: transfer.state
        }
        const stateReceiptHash = hashJSON(stateReceipt)
        const signature = tweetnacl.util.encodeBase64(
          tweetnacl.sign.detached(
            tweetnacl.util.decodeBase64(stateReceiptHash),
            this.keyPair.secretKey))

        yield this.request()
          .get(transfer.id + '/state')
          .expect(200, {
            message: stateReceipt,
            type: 'ed25519-sha512',
            signer: config.server.base_uri,
            public_key: config.keys.ed25519.public,
            signature: signature
          })
          .end()
      })

    it('should return a valid TransferStateReceipt', function *() {
      const transfer = _.cloneDeep(this.executedTransfer)

      yield dbHelper.addTransfers([transfer])

      yield this.request()
        .get(transfer.id + '/state')
        .expect(function (res) {
          let validationResult = validate('TransferStateReceipt', res.body)
          if (!validationResult.valid) {
            throw new Error('Not a valid TransferStateReceipt')
          }
        })
        .end()
    })

    it('should return a rejected transfer receipt if the expires_at date ' +
      'has passed', function *() {
      const transfer = this.transferWithExpiry
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized

      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(201)
        .end()

      const stateReceipt = {
        id: transfer.id,
        state: 'rejected'
      }
      const stateReceiptHash = hashJSON(stateReceipt)
      const signature = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(stateReceiptHash),
          this.keyPair.secretKey))

      // In production this function should be triggered by the worker started in app.js
      this.clock.tick(1000)
      yield transferExpiryMonitor.processExpiredTransfers()

      yield this.request()
        .get(transfer.id + '/state')
        .expect(200, {
          message: stateReceipt,
          type: 'ed25519-sha512',
          signer: config.server.base_uri,
          public_key: config.keys.ed25519.public,
          signature: signature
        })
        .end()
    })
  })
})
