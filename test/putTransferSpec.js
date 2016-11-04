'use strict'

const fs = require('fs')
const assert = require('assert')
const crypto = require('crypto')
const parseURL = require('url').parse
const _ = require('lodash')
const expect = require('chai').expect
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../src/services/app')
const config = require('../src/services/config')
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const upsertAccount = require('../src/models/db/accounts').upsertAccount
const getAccount = require('../src/models/db/accounts').getAccount
const logHelper = require('./helpers/log')
const sinon = require('sinon')
const accounts = require('./data/accounts')
const validator = require('./helpers/validator')
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

const publicKey = fs.readFileSync('./test/data/public.pem', 'utf8')
const privateKey = fs.readFileSync('./test/data/private.pem', 'utf8')

describe('PUT /transfers/:id', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/simpleWithExpiry'))
    this.transferFromEve = _.cloneDeep(require('./data/transfers/fromEve'))
    this.disabledTransferFrom = _.cloneDeep(require('./data/transfers/fromDisabledAccount'))
    this.disabledTransferTo = _.cloneDeep(require('./data/transfers/toDisabledAccount'))
    this.fromZeroMinBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromZeroMinBalance'))
    this.fromFiniteMinBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromFiniteMinBalance'))
    this.fromInfiniteMinBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromInfiniteMinBalance'))
    this.fromNoBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromNoBalanceAccount'))
    this.noBalanceAccount = _.cloneDeep(accounts.noBalance)

    // Store some example data
    accounts.eve.public_key = publicKey
    yield dbHelper.addAccounts(_.values(_.omit(accounts, 'noBalance')))
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
  })

  /* Invalid transfer objects */

  it('should return 400 if the transfer ID is invalid', function * () {
    const transfer = _.clone(this.exampleTransfer)
    delete transfer.id

    yield this.request()
      .put(this.exampleTransfer.id + 'bogus')
      .auth('alice', 'alice')
      .send(transfer)
      .expect(400)
      .end()
  })

  it('should return 400 if the transfer is invalid', function * () {
    const transfer = this.exampleTransfer
    transfer.amount = 'bogus'
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(400)
      .end()
  })

  it('should return 422 if the amount is zero', function * () {
    const transfer = this.exampleTransfer
    transfer.amount = '0'
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the sender doesn\'t have enough money', function * () {
    const transfer = this.exampleTransfer
    transfer.amount = '101'
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the sender amount precision is too high', function * () {
    assert.strictEqual(config.amount.precision, 10) // default precision is 10
    const transfer = this.exampleTransfer
    transfer.amount = '100000000.23'
    yield this.request()
      .put(transfer.id)
      .auth('bob', 'bob')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the sender amount scale is too high', function * () {
    assert.strictEqual(config.amount.scale, 2) // default scale is 2
    const transfer = this.exampleTransfer
    transfer.amount = '1.123'
    yield this.request()
      .put(transfer.id)
      .auth('bob', 'bob')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the sender doesn\'t exist', function * () {
    const transfer = this.transferNoAuthorization
    transfer.debit_account = 'http://localhost/accounts/alois'
    yield this.request()
      .put(this.transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the recipient doesn't exist", function * () {
    const transfer = this.transferNoAuthorization
    transfer.credits[0].account = 'http://localhost/accounts/blob'
    yield this.request()
      .put(this.transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 200 if a transfer is posted with the same expiry date',
    function * () {
      const transfer = _.cloneDeep(this.transferWithExpiry)
      transfer.expires_at = (new Date(Date.now() + 10000)).toISOString()

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      this.clock.tick(2000)

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(validator.validateTransfer)
        .end()
    })

  it('should return 200 if a transfer is re-posted with the same amount in a different format',
    function * () {
      const transfer = _.cloneDeep(this.proposedTransfer)
      transfer.amount = '10'

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()

      this.clock.tick(2000)

      transfer.amount = '10.0'
      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(validator.validateTransfer)
        .end()
    })

  /* Disabled Accounts */
  it('should return a 422 for a transfer from a disabled account', function * () {
    const transfer = this.disabledTransferFrom
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 for a transfer to a disabled account', function * () {
    const transfer = this.disabledTransferTo
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  /* Idempotency */

  it('should return 201 for a newly created transfer', function * () {
    const transfer = this.exampleTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(10)
  })

  it('should return 200 if the transfer already exists', function * () {
    const transfer = this.exampleTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  it('should return 201 if the transfer does not have an ID set', function * () {
    const transferWithoutId = _.cloneDeep(this.exampleTransfer)
    delete transferWithoutId.id
    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transferWithoutId)
      .expect(201)
      .expect(_.assign({}, this.exampleTransfer,
        {
          state: transferStates.TRANSFER_STATE_EXECUTED,
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
          }
        }))
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(10)
  })

  it('should maintain correct precision', function * () {
    const transferWithoutId = _.cloneDeep(this.exampleTransfer)
    delete transferWithoutId.id
    transferWithoutId.amount = transferWithoutId.amount = '5.01'
    for (let i = 0; i < 2; i++) {
      const transferID = this.exampleTransfer.id.slice(0, -1) + i
      yield this.request()
        .put(transferID)
        .auth('alice', 'alice')
        .send(transferWithoutId)
        .expect(201)
        .end()
    }
    expect((yield getAccount('alice')).balance).to.equal(89.98)
  })

  it('should accept a transfer with an upper case ID but convert the ID ' +
    'to lower case', function * () {
    const transfer = _.cloneDeep(this.exampleTransfer)
    // This URI uppercases everything that should be case-insensitive
    const prefix = 'HTTP://LOCALHOST/transfers/'
    transfer.id = prefix + transfer.id.slice(prefix.length)

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        id: transfer.id.toLowerCase(),
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  /* Authorization */

  it('should return 403 if invalid authorization is given', function * () {
    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice:notrealpassword')
      .send(this.exampleTransfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Unknown or invalid account / password')
      })
      .end()
  })

  it('should return 403 if password is missing', function * () {
    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice:')
      .send(this.exampleTransfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Unknown or invalid account / password')
      })
      .end()
  })

  it('should return 403 if authorization is provided that is irrelevant ' +
    'to the transfer', function * () {
    yield this.request()
      .put(transfer.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
      .end()
  })

  it('should return 401 if no authentication is given', function * () {
    yield this.request()
      .put(this.exampleTransfer.id)
      .send(this.exampleTransfer)
      .expect(401)
      .end()
  })

  it('should execute the transfer if it is authorized and ' +
    'there is no execution condition', function * () {
    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(this.exampleTransfer)
      .expect(201)
      .expect(_.assign({}, this.exampleTransfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  it('should execute the transfer if it is authorized by admin and ' +
    'there is no execution condition', function * () {
    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('admin', 'admin')
      .send(this.exampleTransfer)
      .expect(201)
      .expect(_.assign({}, this.exampleTransfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  it('should return 200 if the http-signature is valid', function * () {
    const transfer = this.transferFromEve
    const date = (new Date()).toUTCString()
    const signature = crypto.createSign('RSA-SHA256')
      .update([
        '(request-target): put ' + parseURL(transfer.id).path,
        'date: ' + date
      ].join('\n'))
      .sign({key: privateKey, passphrase: '123456'}, 'base64')

    yield this.request()
      .put(transfer.id)
      .set('Date', date)
      .set('Authorization', 'Signature ' +
        'keyId="eve",' +
        'algorithm="rsa-sha256",' +
        'headers="(request-target) date",' +
        'signature="' + signature + '"')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()
  })

  it('should return 401 if the http-signature is invalid', function * () {
    const transfer = this.transferFromEve
    const date = (new Date()).toUTCString()
    const signature = crypto.createSign('RSA-SHA256')
      .update([
        '(request-target): put ' + parseURL(transfer.id).path + '/wrong',
        'date: ' + date
      ].join('\n'))
      .sign({key: privateKey, passphrase: '123456'}, 'base64')

    yield this.request()
      .put(transfer.id)
      .set('Date', date)
      .set('Authorization', 'Signature ' +
        'keyId="eve",' +
        'algorithm="rsa-sha256",' +
        'headers="(request-target) date",' +
        'signature="' + signature + '"')
      .send(transfer)
      .expect(401)
      .end()
  })


  /* Execution conditions */
  it('should update the state from "prepared" when an execution condition is present', function * () {
    yield this.request()
      .put(this.transferWithExpiry.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transferWithExpiry, {
        state: transferStates.TRANSFER_STATE_PREPARED,
        timeline: {
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  /* Balance limits */
  it('should allow negative balance for sender with negative minimum limit', function * () {
    yield this.request()
      .put(this.fromFiniteMinBalanceAccountTransfer.id)
      .auth('finiteminbal', 'finiteminbal')
      .send(this.fromFiniteMinBalanceAccountTransfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .get(this.fromFiniteMinBalanceAccountTransfer.debit_account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/finiteminbal',
        name: 'finiteminbal',
        ledger: 'http://localhost',
        balance: '-50',
        is_disabled: false,
        minimum_allowed_balance: '-100'
      }))
      .expect(validator.validateAccount)
      .end()

    yield this.request()
      .get(this.fromFiniteMinBalanceAccountTransfer.credits[0].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/bob',
        name: 'bob',
        ledger: 'http://localhost',
        balance: '50',
        is_disabled: false,
        minimum_allowed_balance: '0'
      }))
      .expect(validator.validateAccount)
      .end()
  })

  it('should return the correct balance, if no balance is specified on account creation', function * () {
    const account = this.noBalanceAccount

    yield this.request()
      .put(account.id)
      .auth('admin', 'admin')
      .send(account)
      .expect(201)
      .end()

    yield this.request()
      .put(this.fromNoBalanceAccountTransfer.id)
      .auth('nobalance', 'nobalance')
      .send(this.fromNoBalanceAccountTransfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .get(this.fromNoBalanceAccountTransfer.debit_account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/nobalance',
        name: 'nobalance',
        ledger: 'http://localhost',
        balance: '-50',
        is_disabled: false,
        minimum_allowed_balance: '-100'
      }))
      .expect(validator.validateAccount)
      .end()

    yield this.request()
      .get(this.fromFiniteMinBalanceAccountTransfer.credits[0].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/bob',
        name: 'bob',
        ledger: 'http://localhost',
        balance: '50',
        is_disabled: false,
        minimum_allowed_balance: '0'
      }))
      .expect(validator.validateAccount)
      .end()
  })

  it('should allow arbitrarily negative balance for sender with minimum limit of negative infinity', function * () {
    const transfer = this.fromInfiniteMinBalanceAccountTransfer

    yield this.request()
      .put(transfer.id)
      .auth('infiniteminbal', 'infiniteminbal')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .get(transfer.debit_account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/infiniteminbal',
        name: 'infiniteminbal',
        ledger: 'http://localhost',
        balance: '-100000',
        is_disabled: false,
        minimum_allowed_balance: '-infinity'
      }))
      .expect(validator.validateAccount)
      .end()

    yield this.request()
      .get(transfer.credits[0].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/bob',
        name: 'bob',
        ledger: 'http://localhost',
        balance: '100000',
        is_disabled: false,
        minimum_allowed_balance: '0'
      }))
      .expect(validator.validateAccount)
      .end()
  })

  it('should thow InsufficientFunds error when sender balance goes below minimum_allowed_balance', function * () {
    const transfer = this.fromZeroMinBalanceAccountTransfer

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  describe.skip('rejection', function () {
    it('should return 403 if rejected:true is set for any credits that are ' +
    'not owned by the authorized account', function * () {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized
      transfer.credits[0].rejected = true

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(403)
        .expect(function (res) {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid attempt to reject credit')
        })
        .end()
    })

    it('should reject a proposed transfer', function * () {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized

      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          state: 'proposed',
          timeline: { proposed_at: '2015-06-16T00:00:00.000Z' }
        }))
        .expect(validator.validateTransfer)
        .end()

      transfer.credits[0].rejected = true
      transfer.credits[0].rejection_message = (new Buffer('error 1')).toString('base64')
      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('bob', 'bob')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'rejected',
          rejection_reason: 'cancelled',
          timeline: {
            rejected_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()
    })

    it('should not reject an executed transfer', function * () {
      const transfer = this.exampleTransfer

      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            executed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()

      transfer.credits[0].rejected = true
      transfer.credits[0].rejection_message = (new Buffer('error 1')).toString('base64')
      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('bob', 'bob')
        .send(transfer)
        .expect(400)
        .expect(function (res) {
          expect(res.body.id).to.equal('InvalidModificationError')
          expect(res.body.message).to.equal('Transfers in state executed may not be rejected')
        })
        .end()
    })
  })
})
