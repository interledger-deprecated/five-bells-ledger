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
const logHelper = require('./helpers/log')
const tweetnacl = require('tweetnacl')
const validate = require('five-bells-shared/services/validate')
const hashJSON = require('five-bells-shared/utils/hashJson')
const validator = require('./helpers/validator')
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Transfer State', function () {
  logHelper(logger)

  before(async function () {
    await dbHelper.init()
  })

  beforeEach(async function () {
    appHelper.create(this, app)
    await dbHelper.clean()
    this.clock = sinon.useFakeTimers({
      now: START_DATE,
      toFake: ['Date']
    })

    this.keyPair = tweetnacl.sign.keyPair.fromSeed(
      Buffer.from(config.getIn(['keys', 'ed25519', 'secret']), 'base64')
    )

    // Define example data
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry'))

    // Store some example data
    await dbHelper.addAccounts(_.values(require('./data/accounts')))
  })

  afterEach(async function () {
    this.clock.restore()
  })

  describe('GET /transfers/:uuid/state', function () {
    it('should return 401 if the request is not authenticated', async function () {
      await this.request()
        .get(this.transferWithExpiry.id)
        .expect(401)
    })

    it('should return a 200 if the transfer does not exist', async function () {
      const stateReceipt = {
        id: 'http://localhost/transfers/03b7c787-e104-4390-934e-693072c6eda2',
        state: transferStates.TRANSFER_STATE_NONEXISTENT
      }
      const stateReceiptHash = hashJSON(stateReceipt)
      const signature = Buffer.from(
        tweetnacl.sign.detached(
          Buffer.from(stateReceiptHash, 'base64'),
          this.keyPair.secretKey
        )
      ).toString('base64')

      await this.request()
        .get('/transfers/03b7c787-e104-4390-934e-693072c6eda2/state')
        .auth('admin', 'admin')
        .expect(200, {
          message: stateReceipt,
          type: 'ed25519-sha512',
          signer: config.getIn(['server', 'base_uri']),
          public_key: config.getIn(['keys', 'ed25519', 'public']),
          signature: signature
        })
        .expect(validator.validateTransferStateReceipt)
    })

    it('supports type=sha256', async function () {
      const transfer = _.cloneDeep(this.transferWithExpiry)
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized
      transfer.state = transferStates.TRANSFER_STATE_PROPOSED
      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      const currentToken = Buffer.from(
        tweetnacl.sign.detached(
          Buffer.from(sha512(transfer.id + ':' + transfer.state), 'base64'),
          this.keyPair.secretKey
        )
      ).toString('base64')

      const stateReceipt = {
        id: transfer.id,
        state: transfer.state,
        token: currentToken
      }

      await this.request()
        .get(transfer.id + '/state?type=sha256')
        .auth('alice', 'alice')
        .expect(200, {
          message: stateReceipt,
          type: 'sha256',
          signer: config.getIn(['server', 'base_uri']),
          digest: sha256(stringifyJSON(stateReceipt))
        })
        .expect(validator.validateTransferStateReceipt)
    })

    it('supports type=sha256 and condition_state', async function () {
      const transfer = _.cloneDeep(this.transferWithExpiry)
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized
      transfer.state = transferStates.TRANSFER_STATE_PROPOSED
      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      const currentToken = Buffer.from(
        tweetnacl.sign.detached(
          Buffer.from(sha512(transfer.id + ':' + transfer.state), 'base64'),
          this.keyPair.secretKey
        )
      ).toString('base64')

      const conditionToken = Buffer.from(
        tweetnacl.sign.detached(
          Buffer.from(sha512(transfer.id + ':executed'), 'base64'),
          this.keyPair.secretKey
        )
      ).toString('base64')

      const stateReceipt = {
        id: transfer.id,
        state: transfer.state,
        token: currentToken
      }

      await this.request()
        .get(transfer.id + '/state?type=sha256&condition_state=executed')
        .auth('alice', 'alice')
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
    })

    it('returns 400 if the ?type parameter is invalid', async function () {
      await this.request()
        .get(this.executedTransfer.id + '/state?type=bogus')
        .auth('alice', 'alice')
        .expect(400, {
          id: 'BadRequestError',
          message: 'type is not valid'
        })
    })

    it('should return a 200 and a signed receipt including the message, ' +
      'messageHash, type, public_key, and signature', async function () {
      await dbHelper.addTransfers([this.executedTransfer])

      const stateReceipt = {
        id: this.executedTransfer.id,
        state: this.executedTransfer.state
      }
      const stateReceiptHash = hashJSON(stateReceipt)
      const signature = Buffer.from(
        tweetnacl.sign.detached(
          Buffer.from(stateReceiptHash, 'base64'),
          this.keyPair.secretKey
        )
      ).toString('base64')

      await this.request()
        .get(this.executedTransfer.id + '/state')
        .auth('alice', 'alice')
        .expect(200, {
          message: stateReceipt,
          type: 'ed25519-sha512',
          signer: config.getIn(['server', 'base_uri']),
          public_key: config.getIn(['keys', 'ed25519', 'public']),
          signature: signature
        })
        .expect(validator.validateTransferStateReceipt)
    })

    it('should return the correct state if the transfer is prepared',
      async function () {
        const transfer = _.cloneDeep(this.executedTransfer)
        transfer.state = transferStates.TRANSFER_STATE_PREPARED

        await dbHelper.addTransfers([transfer])

        const stateReceipt = {
          id: transfer.id,
          state: transfer.state
        }
        const stateReceiptHash = hashJSON(stateReceipt)
        const signature = Buffer.from(
          tweetnacl.sign.detached(
            Buffer.from(stateReceiptHash, 'base64'),
            this.keyPair.secretKey
          )
        ).toString('base64')

        await this.request()
          .get(transfer.id + '/state')
          .auth('alice', 'alice')
          .expect(200, {
            message: stateReceipt,
            type: 'ed25519-sha512',
            signer: config.getIn(['server', 'base_uri']),
            public_key: config.getIn(['keys', 'ed25519', 'public']),
            signature: signature
          })
          .expect(validator.validateTransferStateReceipt)
      })

    it('should return a valid TransferStateReceipt', async function () {
      const transfer = _.cloneDeep(this.executedTransfer)

      await dbHelper.addTransfers([transfer])

      await this.request()
        .get(transfer.id + '/state')
        .auth('alice', 'alice')
        .expect(function (res) {
          let validationResult = validate('TransferStateReceipt', res.body)
          if (!validationResult.valid) {
            throw new Error('Not a valid TransferStateReceipt')
          }
        })
        .expect(validator.validateTransferStateReceipt)
    })

    it('should return a rejected transfer receipt if the expires_at date ' +
      'has passed', async function () {
      const transfer = this.transferWithExpiry
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      const stateReceipt = {
        id: transfer.id,
        state: transferStates.TRANSFER_STATE_REJECTED
      }
      const stateReceiptHash = hashJSON(stateReceipt)
      const signature = Buffer.from(
        tweetnacl.sign.detached(
          Buffer.from(stateReceiptHash, 'base64'),
          this.keyPair.secretKey
        )
      ).toString('base64')

      // In production this function should be triggered by the worker started in app.js
      this.clock.tick(1000)
      await transferExpiryMonitor.processExpiredTransfers()

      await this.request()
        .get(transfer.id + '/state')
        .auth('alice', 'alice')
        .expect(200, {
          message: stateReceipt,
          type: 'ed25519-sha512',
          signer: config.getIn(['server', 'base_uri']),
          public_key: config.getIn(['keys', 'ed25519', 'public']),
          signature: signature
        })
        .expect(validator.validateTransferStateReceipt)
    })
  })
})

function sha256 (str) {
  return crypto.createHash('sha256').update(str).digest('base64')
}

function sha512 (str) {
  return crypto.createHash('sha512').update(str).digest('base64')
}
