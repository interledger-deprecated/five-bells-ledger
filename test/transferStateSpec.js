/*global describe, it*/
'use strict'
const crypto = require('crypto')
const _ = require('lodash')
const stringifyJSON = require('canonical-json')
const sinon = require('sinon')
const app = require('../src/services/app')
const logger = require('../src/services/log')
const config = require('../src/services/config')
const transferExpiryMonitor = require('../src/services/transferExpiryMonitor')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')
const tweetnacl = require('tweetnacl')
const validate = require('five-bells-shared/services/validate')
const hashJSON = require('five-bells-shared/utils/hashJson')
const validator = require('./helpers/validator')
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Transfer State', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date', 'setTimeout', 'setImmediate')

    this.keyPair =
      tweetnacl.sign.keyPair.fromSecretKey(
        tweetnacl.util.decodeBase64(config.getIn(['keys', 'ed25519', 'secret'])))

    // Define example data
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry'))

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
        state: transferStates.TRANSFER_STATE_NONEXISTENT
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
          signer: config.getIn(['server', 'base_uri']),
          public_key: config.getIn(['keys', 'ed25519', 'public']),
          signature: signature
        })
        .expect(validator.validateTransferStateReceipt)
        .end()
    })

    it('supports type=sha256', function *() {
      const transfer = _.cloneDeep(this.transferWithExpiry)
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized
      transfer.state = transferStates.TRANSFER_STATE_PROPOSED
      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      const currentToken = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(sha512(transfer.id + ':' + transfer.state)),
          this.keyPair.secretKey))
      const stateReceipt = {
        id: transfer.id,
        state: transfer.state,
        token: currentToken
      }

      yield this.request()
        .get(transfer.id + '/state?type=sha256')
        .expect(200, {
          message: stateReceipt,
          type: 'sha256',
          signer: config.getIn(['server', 'base_uri']),
          digest: sha256(stringifyJSON(stateReceipt))
        })
        .expect(validator.validateTransferStateReceipt)
        .end()
    })

    it('supports type=sha256 and condition_state', function *() {
      const transfer = _.cloneDeep(this.transferWithExpiry)
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized
      transfer.state = transferStates.TRANSFER_STATE_PROPOSED
      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      const currentToken = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(sha512(transfer.id + ':' + transfer.state)),
          this.keyPair.secretKey))
      const conditionToken = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(sha512(transfer.id + ':executed')),
          this.keyPair.secretKey))
      const stateReceipt = {
        id: transfer.id,
        state: transfer.state,
        token: currentToken
      }

      yield this.request()
        .get(transfer.id + '/state?type=sha256&condition_state=executed')
        .expect(200, {
          message: stateReceipt,
          type: 'sha256',
          signer: config.getIn(['server', 'base_uri']),
          digest: sha256(stringifyJSON(stateReceipt)),
          condition_state: transferStates.TRANSFER_STATE_EXECUTED,
          condition_digest: sha256(stringifyJSON({
            id: transfer.id,
            state: transferStates.TRANSFER_STATE_EXECUTED,
            token: conditionToken
          }))
        })
        .expect(validator.validateTransferStateReceipt)
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
          signer: config.getIn(['server', 'base_uri']),
          public_key: config.getIn(['keys', 'ed25519', 'public']),
          signature: signature
        })
        .expect(validator.validateTransferStateReceipt)
        .end()
    })

    it('should return the correct state if the transfer is prepared',
      function *() {
        const transfer = _.cloneDeep(this.executedTransfer)
        transfer.state = transferStates.TRANSFER_STATE_PREPARED

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
            signer: config.getIn(['server', 'base_uri']),
            public_key: config.getIn(['keys', 'ed25519', 'public']),
            signature: signature
          })
          .expect(validator.validateTransferStateReceipt)
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
        .expect(validator.validateTransferStateReceipt)
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
        .expect(validator.validateTransfer)
        .end()

      const stateReceipt = {
        id: transfer.id,
        state: transferStates.TRANSFER_STATE_REJECTED
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
          signer: config.getIn(['server', 'base_uri']),
          public_key: config.getIn(['keys', 'ed25519', 'public']),
          signature: signature
        })
        .expect(validator.validateTransferStateReceipt)
        .end()
    })
  })
})

function sha256 (str) {
  return crypto.createHash('sha256').update(str).digest('base64')
}

function sha512 (str) {
  return crypto.createHash('sha512').update(str).digest('base64')
}
