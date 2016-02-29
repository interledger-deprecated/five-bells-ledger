/*global describe, it*/
'use strict'
const fs = require('fs')
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
const Account = require('../src/models/db/account').Account
const Subscription = require('../src/models/db/subscription').Subscription
const logHelper = require('five-bells-shared/testHelpers/log')
const sinon = require('sinon')
const notificationWorker = require('../src/services/notificationWorker')
const accounts = require('./data/accounts')
const validator = require('./helpers/validator')
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

const publicKey = fs.readFileSync('./test/data/public.pem', 'utf8')
const privateKey = fs.readFileSync('./test/data/private.pem', 'utf8')

describe('PUT /transfers/:id', function () {
  logHelper(logger)

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.init()

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.transferNoAuthorization =
      _.cloneDeep(require('./data/transfers/noAuthorization'))
    this.multiCreditTransfer =
      _.cloneDeep(require('./data/transfers/multiCredit'))
    this.multiDebitTransfer = _.cloneDeep(require('./data/transfers/multiDebit'))
    this.multiDebitAndCreditTransfer =
      _.cloneDeep(require('./data/transfers/multiDebitAndCredit'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry'))
    this.transferFromEve = _.cloneDeep(require('./data/transfers/fromEve'))
    this.disabledTransferFrom = _.cloneDeep(require('./data/transfers/fromDisabledAccount'))
    this.disabledTransferTo = _.cloneDeep(require('./data/transfers/toDisabledAccount'))
    this.proposedTransfer = _.cloneDeep(require('./data/transfers/proposed'))

    // Reset database
    yield dbHelper.reset()

    // Store some example data
    accounts.eve.public_key = publicKey
    yield dbHelper.addAccounts(_.values(accounts))
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
    transfer.debits[0].amount = 'bogus'
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(400)
      .end()
  })

  it('should return 422 if the source amount is zero', function * () {
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = '0'
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the destination amount is zero', function * () {
    const transfer = this.exampleTransfer
    transfer.credits[0].amount = '0'
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the sender doesn't have enough money", function * () {
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = '101'
    transfer.credits[0].amount = '101'
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the sender doesn't exist", function * () {
    const transfer = this.transferNoAuthorization
    transfer.debits[0].account = 'http://localhost/accounts/alois'
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

  it("should return 422 if source and destination amounts don't match", function * () {
    const transfer = this.transferNoAuthorization
    transfer.credits[0].amount = '122'
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
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized
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

  it('should return 422 if a transfer is modified after its ' +
    'expiry date', function * () {
    const transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized

    const transferNoAuthorization = _.cloneDeep(transfer)
    delete transferNoAuthorization.debits[1].authorized

    yield this.request()
      .put(this.transferWithExpiry.id)
      .auth('alice', 'alice')
      .send(transferNoAuthorization)
      .expect(201)
      .expect(_.assign({}, transferNoAuthorization, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    this.clock.tick(2000)

    yield this.request()
      .put(this.transferWithExpiry.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('ExpiredTransferError')
        expect(res.body.message).to.equal('Cannot modify transfer after ' +
          'expires_at date')
      })
      .end()
  })

  it('should return 422 if the expires_at field is removed', function * () {
    let transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    let transferWithoutExpiry = _.cloneDeep(transfer)
    delete transferWithoutExpiry.expires_at

    yield this.request()
      .put(this.transferWithExpiry.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    this.clock.tick(2000)

    yield this.request()
      .put(this.transferWithExpiry.id)
      .auth('alice', 'alice')
      .send(transferWithoutExpiry)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
      .end()
  })

  it('should return 422 if the credits are greater than the debits', function * () {
    const transfer = this.multiDebitAndCreditTransfer
    transfer.credits[0].amount = String(parseFloat(transfer.credits[0].amount) + 0.00000001)

    yield this.request()
      .put(this.multiDebitAndCreditTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
      .end()
  })

  it('should return 422 if the debits are greater than the credits', function * () {
    const transfer = this.multiDebitAndCreditTransfer
    transfer.debits[0].amount = String(parseFloat(transfer.debits[0].amount) + 0.00000001)

    yield this.request()
      .put(this.multiDebitAndCreditTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
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

  it('should allow a transfer involving a disabled account to complete execution', function * () {
    const transferNoAuthorization = _.cloneDeep(this.transferNoAuthorization)
    /* propose transfer: Alice -> Bob */
    yield this.request()
      .put(transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transferNoAuthorization)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    /* Disable bobs's account */
    const bobAccount = yield Account.findByName(accounts.bob.name)
    bobAccount.is_disabled = true
    yield bobAccount.save()

    transferNoAuthorization.debits[0].authorized = true

    /* execute transfer: Alice -> Bob */
    yield this.request()
      .put(transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transferNoAuthorization)
      .expect(200)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
    .get(this.executedTransfer.credits[0].account)
    .auth('admin', 'admin')
    .expect(200)
    .expect({
      id: 'http://localhost/accounts/bob',
      name: 'bob',
      balance: '10',
      is_disabled: true,
      ledger: 'http://localhost'
    })
    .expect(validator.validateAccount)
    .end()

    yield this.request()
      .get(this.executedTransfer.debits[0].account)
      .auth('alice', 'alice')
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/alice',
        name: 'alice',
        balance: '90',
        is_disabled: false,
        ledger: 'http://localhost'
      })
      .expect(validator.validateAccount)
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
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(90)
    expect((yield Account.findByName('bob')).balance).to.equal(10)
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
          proposed_at: '2015-06-16T00:00:00.000Z'
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
          proposed_at: '2015-06-16T00:00:00.000Z'
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
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(90)
    expect((yield Account.findByName('bob')).balance).to.equal(10)
  })

  it.skip('should round properly', function * () {
    const transferWithoutId = _.cloneDeep(this.exampleTransfer)
    delete transferWithoutId.id
    transferWithoutId.debits[0].amount = transferWithoutId.credits[0].amount = '5.0101'
    for (let i = 0; i < 2; i++) {
      const transferID = this.exampleTransfer.id.slice(0, -1) + i
      yield this.request()
        .put(transferID)
        .auth('alice', 'alice')
        .send(transferWithoutId)
        .expect(201)
        .end()
    }
    expect((yield Account.findByName('alice')).balance).to.equal(89.9798)
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
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  /* Authorization */

  it('should set the transfer state to "proposed" and authorized to false ' +
    'if no authorization is provided', function * () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transferWithoutAuthorization)
      .expect(201)
      .expect(_.assign({}, transferWithoutAuthorization, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  it('should return 403 if invalid authorization is given', function * () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put(transfer.id)
      .auth(transfer.debits[0].account + ':notrealpassword')
      .send(transferWithoutAuthorization)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Unknown or invalid account / password')
      })
      .end()
  })

  it('should return 403 if password is missing', function * () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put(transfer.id)
      .auth(transfer.debits[0].account + ':')
      .send(transferWithoutAuthorization)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Unknown or invalid account / password')
      })
      .end()
  })

  it('should return 403 if authorization is provided that is irrelevant ' +
    'to the transfer', function * () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put(transfer.id)
      .auth('candice', 'candice')
      .send(transferWithoutAuthorization)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
      .end()
  })

  it('should return 401 if authorized:true is set without any authentication',
    function * () {
      const transfer = this.exampleTransfer

      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(401)
        .end()
    })

  it('should return 401 if authorized:false is set without any authentication',
    function * () {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized

      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(401)
        .end()
    })

  it('should return 403 if authentication invalid',
    function * () {
      const transfer = this.exampleTransfer

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'wrongPassword')
        .send(transfer)
        .expect(403)
        .expect((res) => {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid password')
        })
        .end()
    })

  it('should return 403 if authorized:true is set for any debits that are ' +
    'not owned by the authorized account', function * () {
    const transfer = this.multiDebitTransfer

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
      .end()
  })

  it('should return 400 if an unauthorized debit is removed', function * () {
    const transfer = this.multiDebitTransfer

    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    // Remove a debit and change credits to match
    transfer.debits = transfer.debits.slice(0, 1)
    transfer.credits[0].amount = '10'

    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
      .end()
  })

  it('should keep the state as "proposed" if not all debits are authorized',
    function * () {
      const transfer = this.multiDebitTransfer
      delete transfer.debits[1].authorized

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          state: transferStates.TRANSFER_STATE_PROPOSED,
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()
    })

  it('should only set the state to "prepared" if all debits are authorized',
    function * () {
      let transfer = this.multiDebitTransfer
      transfer.execution_condition = this.executedTransfer.execution_condition
      let incompleteTransfer = _.cloneDeep(transfer)
      delete incompleteTransfer.debits[1].authorized

      yield this.request()
        .put(this.multiDebitTransfer.id)
        .auth('alice', 'alice')
        .send(incompleteTransfer)
        .expect(201)
        .expect(_.assign({}, incompleteTransfer, {
          state: transferStates.TRANSFER_STATE_PROPOSED,
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()

      yield this.request()
        .put(this.multiDebitTransfer.id)
        .auth('candice', 'candice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: transferStates.TRANSFER_STATE_PREPARED,
          timeline: {
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()
    })

  it('should execute the transfer if it is authorized and ' +
    'there is no execution condition', function * () {
    const transfer = this.exampleTransfer

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  it('should return 403 if an unauthorized user attempts to ' +
    'modify the "authorized" field', function * () {
    const transfer = this.exampleTransfer
    let incompleteTransfer = _.cloneDeep(transfer)
    delete incompleteTransfer.debits[0].authorized

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(incompleteTransfer)
      .expect(201)
      .expect(_.assign({}, incompleteTransfer, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
      .end()
  })

  it('should allow authorizations to be added after the transfer is proposed',
    function * () {
      let transfer = this.exampleTransfer

      let unauthorizedTransfer = _.cloneDeep(transfer)
      delete unauthorizedTransfer.debits[0].authorized

      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(unauthorizedTransfer)
        .expect(201)
        .expect(_.assign({}, unauthorizedTransfer, {
          state: transferStates.TRANSFER_STATE_PROPOSED,
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()

      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: transferStates.TRANSFER_STATE_EXECUTED,
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()
    })

  it('should allow additional authorizations to be added after ' +
    'the transfer is proposed', function * () {
    let transfer = this.multiDebitTransfer

    let unauthorizedTransfer = _.cloneDeep(transfer)
    delete unauthorizedTransfer.debits[0].authorized
    delete unauthorizedTransfer.debits[1].authorized

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('alice', 'alice')
      .send(unauthorizedTransfer)
      .expect(201)
      .expect(_.assign({}, unauthorizedTransfer, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('alice', 'alice')
      .send(_.merge(unauthorizedTransfer, {
        debits: [{ authorized: true }]
      }))
      .expect(200)
      .expect(_.assign({}, unauthorizedTransfer, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  it('should set the transfer state to "proposed" if no authorization is given',
    function * () {
      const transfer = this.exampleTransfer
      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {
          state: transferStates.TRANSFER_STATE_PROPOSED,
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()
    })

  it('should update the state from "proposed" to "executed" when ' +
    'authorization is added and no execution condition is given', function * () {
    const transfer = this.exampleTransfer

    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transferWithoutAuthorization)
      .expect(201)
      .expect(_.assign({}, transferWithoutAuthorization, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    this.clock.tick(1)

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.001Z',
          prepared_at: '2015-06-16T00:00:00.001Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()
  })

  /* Execution conditions */
  it('should update the state from "proposed" to "prepared" when ' +
  'authorization is added and an execution condition is present',
    function * () {
      const transfer = this.executedTransfer

      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put(this.executedTransfer.id)
        .auth('alice', 'alice')
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {
          state: transferStates.TRANSFER_STATE_PROPOSED,
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()

      yield this.request()
        .put(this.executedTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: transferStates.TRANSFER_STATE_PREPARED,
          timeline: {
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()
    })

  /* Subscriptions */
  it('should trigger subscriptions', function * () {
    const subscription = require('./data/subscription1.json')
    yield Subscription.createExternal(subscription)

    const transfer = this.exampleTransfer
    const transferResult = _.assign({}, transfer, {
      state: transferStates.TRANSFER_STATE_EXECUTED,
      timeline: {
        executed_at: '2015-06-16T00:00:00.000Z',
        prepared_at: '2015-06-16T00:00:00.000Z',
        proposed_at: '2015-06-16T00:00:00.000Z'
      }
    })

    const notification = nock('http://subscriber.example')
      .post('/notifications', (body) => {
        const idParts = body.id.split('/')
        const notificationId = idParts[idParts.length - 1]
        expect(body).to.deep.equal({
          event: 'transfer.update',
          id: subscription.id + '/notifications/' + notificationId,
          subscription: subscription.id,
          resource: transferResult
        })
        // TODO validate this against notification schema
        return true
      })
      .reply(204)

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(transferResult)
      .expect(validator.validateTransfer)
      .end()

    yield notificationWorker.processNotificationQueue()

    notification.done()
  })

  /* Multiple credits and/or debits */

  it('should handle transfers with multiple credits', function * () {
    const transfer = this.multiCreditTransfer

    yield this.request()
      .put(this.multiCreditTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .get(this.multiCreditTransfer.credits[0].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/bob',
        name: 'bob',
        ledger: 'http://localhost',
        balance: '10',
        is_disabled: false
      })
      .expect(validator.validateAccount)
      .end()

    yield this.request()
      .get(this.multiCreditTransfer.credits[1].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/dave',
        name: 'dave',
        ledger: 'http://localhost',
        balance: '10',
        is_disabled: false
      })
      .expect(validator.validateAccount)
      .end()
  })

  it('should handle transfers with multiple debits', function * () {
    const transfer = this.multiDebitTransfer

    let transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[1].authorized

    /* propose */
    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('alice', 'alice')
      .send(transferWithoutAuthorization)
      .expect(201)
      .expect(_.assign({}, transferWithoutAuthorization, {
        state: transferStates.TRANSFER_STATE_PROPOSED,
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    /* prepare */
    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transfer, {
        state: transferStates.TRANSFER_STATE_EXECUTED,
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .get(this.multiDebitTransfer.debits[0].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/alice',
        name: 'alice',
        ledger: 'http://localhost',
        balance: '90',
        is_disabled: false
      }))
      .expect(validator.validateAccount)
      .end()

    yield this.request()
      .get(this.multiDebitTransfer.debits[1].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/candice',
        name: 'candice',
        ledger: 'http://localhost',
        balance: '40',
        is_disabled: false
      }))
      .expect(validator.validateAccount)
      .end()
  })

  it('should handle transfers with multiple debits and multiple credits',
    function * () {
      const transfer = this.multiDebitAndCreditTransfer

      let transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[1].authorized

      /* propose */
      yield this.request()
        .put(this.multiDebitAndCreditTransfer.id)
        .auth('alice', 'alice')
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {
          state: transferStates.TRANSFER_STATE_PROPOSED,
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()

      /* prepare (authorize) */
      yield this.request()
        .put(this.multiDebitAndCreditTransfer.id)
        .auth('candice', 'candice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: transferStates.TRANSFER_STATE_EXECUTED,
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()

      yield this.request()
        .get(this.multiDebitAndCreditTransfer.debits[0].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/alice',
          name: 'alice',
          ledger: 'http://localhost',
          balance: '50',
          is_disabled: false
        }))
        .expect(validator.validateAccount)
        .end()

      yield this.request()
        .get(this.multiDebitAndCreditTransfer.debits[1].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/candice',
          name: 'candice',
          ledger: 'http://localhost',
          balance: '30',
          is_disabled: false
        }))
        .expect(validator.validateAccount)
        .end()

      yield this.request()
        .get(this.multiDebitAndCreditTransfer.credits[0].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/bob',
          name: 'bob',
          ledger: 'http://localhost',
          balance: '30',
          is_disabled: false
        }))
        .expect(validator.validateAccount)
        .end()

      yield this.request()
        .get(this.multiDebitAndCreditTransfer.credits[1].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/dave',
          name: 'dave',
          ledger: 'http://localhost',
          balance: '40',
          is_disabled: false
        }))
        .expect(validator.validateAccount)
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

  describe('FEATURE_CREDIT_AUTH=true', function () {
    // Kludge to work around immutable config
    const features = _.find(config._root.entries, function (entry) {
      return entry[0] === 'features'
    })[1]
    const hasCreditAuth = _.find(features._root.entries, function (entry) {
      return entry[0] === 'hasCreditAuth'
    })
    before(function () { hasCreditAuth[1] = true })
    after(function () { hasCreditAuth[1] = false })

    it('succeeds if no authorization is provided', function *() {
      const transfer = this.exampleTransfer
      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized
      yield this.request()
        .put(transfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {
          state: 'proposed',
          timeline: { proposed_at: '2015-06-16T00:00:00.000Z' }
        }))
        .expect(validator.validateTransfer)
        .end()
    })

    it('should return 403 if authorized:true is set for any credits that are ' +
    'not owned by the authorized account', function *() {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized
      transfer.credits[0].authorized = true

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(403)
        .expect(function (res) {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid attempt to authorize credit')
        })
        .end()
    })

    it('should execute the transfer if it is authorized and ' +
    'there is no execution condition', function *() {
      const transfer = this.exampleTransfer

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

      transfer.credits[0].authorized = true
      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('bob', 'bob')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .expect(validator.validateTransfer)
        .end()
    })
  })
})
