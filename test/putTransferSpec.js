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
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const Account = require('../src/models/db/account').Account
const Subscription = require('../src/models/db/subscription').Subscription
const logHelper = require('five-bells-shared/testHelpers/log')
const sinon = require('sinon')
const notificationWorker = require('../src/services/notificationWorker')
const accounts = require('./data/accounts')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

const publicKey = fs.readFileSync(__dirname + '/data/public.pem', 'utf8')
const privateKey = fs.readFileSync(__dirname + '/data/private.pem', 'utf8')

describe('PUT /transfers/:id', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date', 'setTimeout', 'setImmediate')

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transferSimple'))
    this.transferNoAuthorization =
      _.cloneDeep(require('./data/transferNoAuthorization'))
    this.multiCreditTransfer =
      _.cloneDeep(require('./data/transferMultiCredit'))
    this.multiDebitTransfer = _.cloneDeep(require('./data/transferMultiDebit'))
    this.multiDebitAndCreditTransfer =
      _.cloneDeep(require('./data/transferMultiDebitAndCredit'))
    this.executedTransfer = _.cloneDeep(require('./data/transferExecuted'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transferWithExpiry'))
    this.transferFromEve = _.cloneDeep(require('./data/transferFromEve'))
    this.disabledTransferFrom = _.cloneDeep(require('./data/transferFromDisabledAccount'))
    this.disabledTransferTo = _.cloneDeep(require('./data/transferToDisabledAccount'))
    this.proposedTransfer = _.cloneDeep(require('./data/transferProposed'))

    // Reset database
    yield dbHelper.reset()

    // Store some example data
    accounts.eve.public_key = publicKey
    yield dbHelper.addAccounts(_.values(accounts))
  })

  afterEach(function *() {
    nock.cleanAll()
    this.clock.restore()
  })

  /* Invalid transfer objects */

  it('should return 400 if the transfer ID is invalid', function *() {
    const transfer = _.clone(this.exampleTransfer)
    delete transfer.id

    yield this.request()
      .put(this.exampleTransfer.id + 'bogus')
      .send(transfer)
      .expect(400)
      .end()
  })

  it('should return 400 if the transfer is invalid', function *() {
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = 'bogus'
    yield this.request()
      .put(transfer.id)
      .send(transfer)
      .expect(400)
      .end()
  })

  it('should return 422 if the source amount is zero', function *() {
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = '0'
    yield this.request()
      .put(transfer.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the destination amount is zero', function *() {
    const transfer = this.exampleTransfer
    transfer.credits[0].amount = '0'
    yield this.request()
      .put(transfer.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the sender doesn't have enough money", function *() {
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

  it("should return 422 if the sender doesn't exist", function *() {
    const transfer = this.transferNoAuthorization
    transfer.debits[0].account = 'http://localhost/accounts/alois'
    yield this.request()
      .put(this.transferNoAuthorization.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the recipient doesn't exist", function *() {
    const transfer = this.transferNoAuthorization
    transfer.credits[0].account = 'http://localhost/accounts/blob'
    yield this.request()
      .put(this.transferNoAuthorization.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if source and destination amounts don't match", function *() {
    const transfer = this.transferNoAuthorization
    transfer.credits[0].amount = '122'
    yield this.request()
      .put(this.transferNoAuthorization.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the signature is invalid', function *() {
    const transfer = this.executedTransfer
    transfer.execution_condition_fulfillment.signature = 'aW52YWxpZA=='

    yield this.request()
      .put(this.executedTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 200 if a transfer is posted with the same expiry date',
    function *() {
      const transfer = _.cloneDeep(this.transferWithExpiry)
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized
      transfer.expires_at = (new Date(Date.now() + 10000)).toISOString()

      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(201)
        .end()

      this.clock.tick(2000)

      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(200)
        .end()
    })

  it('should return 422 if a transfer is modified after its ' +
    'expiry date', function *() {
    const transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized

    const transferNoAuthorization = _.cloneDeep(transfer)
    delete transferNoAuthorization.debits[1].authorized

    yield this.request()
      .put(this.transferWithExpiry.id)
      .send(transferNoAuthorization)
      .expect(201)
      .expect(_.assign({}, transferNoAuthorization, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
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

  it('should return 422 if the expires_at field is removed', function *() {
    let transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    let transferWithoutExpiry = _.cloneDeep(transfer)
    delete transferWithoutExpiry.expires_at

    yield this.request()
      .put(this.transferWithExpiry.id)
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    this.clock.tick(2000)

    yield this.request()
      .put(this.transferWithExpiry.id)
      .send(transferWithoutExpiry)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
      .end()
  })

  it('should return 422 if the credits are greater than the debits', function *() {
    const transfer = this.multiDebitAndCreditTransfer
    transfer.credits[0].amount = String(parseFloat(transfer.credits[0].amount) + 0.00000001)

    yield this.request()
      .put(this.multiDebitAndCreditTransfer.id)
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
      .end()
  })

  it('should return 422 if the debits are greater than the credits', function *() {
    const transfer = this.multiDebitAndCreditTransfer
    transfer.debits[0].amount = String(parseFloat(transfer.debits[0].amount) + 0.00000001)

    yield this.request()
      .put(this.multiDebitAndCreditTransfer.id)
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
      .end()
  })

  /* Disabled Accounts */
  it('should return a 422 for a transfer from a disabled account', function *() {
    const transfer = this.disabledTransferFrom
    yield this.request()
      .put(transfer.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 for a transfer to a disabled account', function *() {
    const transfer = this.disabledTransferTo
    yield this.request()
      .put(transfer.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should allow a transfer involving a disabled account to complete execution', function *() {
    const proposedTransfer = this.proposedTransfer
    const executedTransfer = this.executedTransfer
    /* prepare transfer: Alice -> Bob */
    yield this.request()
      .put(proposedTransfer.id)
      .auth('alice', 'alice')
      .send(proposedTransfer)
      .expect(201)
      .end()

    /* Disable bobs's account */
    const bobAccount = yield Account.findByName(accounts.bob.name)
    bobAccount.is_disabled = true
    bobAccount.save()

    /* execute transfer: Alice -> Bob*/
    yield this.request()
      .put(executedTransfer.id)
      .auth('alice', 'alice')
      .send(executedTransfer)
      .expect(200)
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
      .end()
  })

  /* Idempotency */

  it('should return 201 for a newly created transfer', function *() {
    const transfer = this.exampleTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(90)
    expect((yield Account.findByName('bob')).balance).to.equal(10)
  })

  it('should return 200 if the transfer already exists', function *() {
    const transfer = this.exampleTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .put(transfer.id)
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
      .end()
  })

  it('should return 201 if the transfer does not have an ID set', function *() {
    const transferWithoutId = _.cloneDeep(this.exampleTransfer)
    delete transferWithoutId.id
    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transferWithoutId)
      .expect(201)
      .expect(_.assign({}, this.exampleTransfer,
        {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
      .end()

    // Check balances
    expect((yield Account.findByName('alice')).balance).to.equal(90)
    expect((yield Account.findByName('bob')).balance).to.equal(10)
  })

  it('should accept a transfer with an upper case ID but convert the ID ' +
    'to lower case', function *() {
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
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()
  })

  /* Authorization */

  it('should set the transfer state to "proposed" and authorized to false ' +
    'if no authorization is provided', function *() {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put(transfer.id)
      .send(transferWithoutAuthorization)
      .expect(201)
      .expect(_.assign({}, transferWithoutAuthorization, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()
  })

  it('should return 403 if invalid authorization is given', function *() {
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

  it('should return 403 if password is missing', function *() {
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
    'to the transfer', function *() {
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
        expect(res.body.message).to.equal('Unknown or invalid account ' +
          '/ password')
      })
      .end()
  })

  it('should return 403 if authorized:true is set without any authorization',
    function *() {
      const transfer = this.exampleTransfer

      yield this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(403)
        .expect(function (res) {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid attempt to authorize debit')
        })
        .end()
    })

  it('should return 403 if authorized:true is set for any debits that are ' +
    'not owned by the authorized account', function *() {
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

  it('should return 400 if an unauthorized debit is removed', function *() {
    const transfer = this.multiDebitTransfer

    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    yield this.request()
      .put(transfer.id)
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    // Remove a debit and change credits to match
    transfer.debits = transfer.debits.slice(0, 1)
    transfer.credits[0].amount = '10'

    yield this.request()
      .put(transfer.id)
      .send(transfer)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
      .end()
  })

  it('should keep the state as "proposed" if not all debits are authorized',
    function *() {
      const transfer = this.multiDebitTransfer
      delete transfer.debits[1].authorized

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should only set the state to "prepared" if all debits are authorized',
    function *() {
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
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      yield this.request()
        .put(this.multiDebitTransfer.id)
        .auth('candice', 'candice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'prepared',
          timeline: {
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should set the state to "rejected" if and only if the ' +
    'cancellation_condition_fulfillment is present',
    function *() {
      let transfer = this.exampleTransfer
      delete transfer.debits[0].authorized
      transfer.cancellation_condition = this.executedTransfer.execution_condition

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .end()

      // Invalid fulfillment
      transfer.cancellation_condition_fulfillment = {
        'type': 'ed25519-sha512',
        'signature': crypto.createHash('sha512').update('nope').digest('base64')
      }
      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(422)
        .expect({
          id: 'UnmetConditionError',
          message: 'ConditionFulfillment failed'
        })
        .end()

      transfer.cancellation_condition_fulfillment = this.executedTransfer.execution_condition_fulfillment
      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'rejected',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z',
            rejected_at: '2015-06-16T00:00:00.000Z'
          }
        }))
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
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()
  })

  it('should return 403 if an unauthorized user attempts to ' +
    'modify the "authorized" field', function *() {
    const transfer = this.exampleTransfer
    let incompleteTransfer = _.cloneDeep(transfer)
    delete incompleteTransfer.debits[0].authorized

    yield this.request()
      .put(this.exampleTransfer.id)
      .send(incompleteTransfer)
      .expect(201)
      .expect(_.assign({}, incompleteTransfer, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .put(this.exampleTransfer.id)
      .send(transfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
      .end()
  })

  it('should allow authorizations to be added after the transfer is proposed',
    function *() {
      let transfer = this.exampleTransfer

      let unauthorizedTransfer = _.cloneDeep(transfer)
      delete unauthorizedTransfer.debits[0].authorized

      yield this.request()
        .put(this.exampleTransfer.id)
        .send(unauthorizedTransfer)
        .expect(201)
        .expect(_.assign({}, unauthorizedTransfer, {
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      yield this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
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
        .end()
    })

  it('should allow additional authorizations to be added after ' +
    'the transfer is proposed', function *() {
    let transfer = this.multiDebitTransfer

    let unauthorizedTransfer = _.cloneDeep(transfer)
    delete unauthorizedTransfer.debits[0].authorized
    delete unauthorizedTransfer.debits[1].authorized

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .send(unauthorizedTransfer)
      .expect(201)
      .expect(_.assign({}, unauthorizedTransfer, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('alice', 'alice')
      .send(_.merge(unauthorizedTransfer, {
        debits: [{ authorized: true }]
      }))
      .expect(200)
      .expect(_.assign({}, unauthorizedTransfer, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('candice', 'candice')
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
      .end()
  })

  it('should set the transfer state to "proposed" if no authorization is given',
    function *() {
      const transfer = this.exampleTransfer
      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put(this.exampleTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should update the state from "proposed" to "executed" when ' +
    'authorization is added and no execution condition is given', function *() {
    const transfer = this.exampleTransfer

    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put(this.exampleTransfer.id)
      .send(transferWithoutAuthorization)
      .expect(201)
      .expect(_.assign({}, transferWithoutAuthorization, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    this.clock.tick(1)

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.001Z',
          prepared_at: '2015-06-16T00:00:00.001Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()
  })

  /* Execution conditions */

  it('should update the state from "proposed" to "prepared" when' +
  'authorization is added and an execution condition is present',
    function *() {
      const transfer = this.executedTransfer
      delete transfer.execution_condition_fulfillment

      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put(this.executedTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      yield this.request()
        .put(this.executedTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'prepared',
          timeline: {
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should update the state from "prepared" to "executed" ' +
  'when the execution criteria is met',
    function *() {
      const transfer = this.executedTransfer
      delete transfer.state

      const transferWithoutConditionFulfillment = _.cloneDeep(transfer)
      delete transferWithoutConditionFulfillment.execution_condition_fulfillment

      yield this.request()
        .put(this.executedTransfer.id)
        .auth('alice', 'alice')
        .send(transferWithoutConditionFulfillment)
        .expect(201)
        .expect(_.assign({}, transferWithoutConditionFulfillment, {
          state: 'prepared',
          timeline: {
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      yield this.request()
        .put(this.executedTransfer.id)
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
        .end()
    })

  /* Subscriptions */

  it('should trigger subscriptions', function *() {
    const subscription = require('./data/subscription1.json')
    yield Subscription.fromDataExternal(subscription).create()

    const transfer = this.exampleTransfer
    const transferResult = _.assign({}, transfer, {
      state: 'executed',
      timeline: {
        executed_at: '2015-06-16T00:00:00.000Z',
        prepared_at: '2015-06-16T00:00:00.000Z',
        proposed_at: '2015-06-16T00:00:00.000Z'
      }
    })

    const notification = nock('http://subscriber.example')
      .post('/notifications', (body) => {
        const idParts = body.id.split('/')
        const notificationId = body.id.split('/')[idParts.length - 1]
        expect(body).to.deep.equal({
          event: 'transfer.update',
          id: subscription.id + '/notifications/' + notificationId,
          resource: transferResult
        })
        return true
      })
      .reply(204)

    yield this.request()
      .put(this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(transferResult)
      .end()

    yield notificationWorker.processNotificationQueue()

    notification.done()
  })

  /* Multiple credits and/or debits */

  it('should handle transfers with multiple credits', function *() {
    const transfer = this.multiCreditTransfer

    yield this.request()
      .put(this.multiCreditTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
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
      .end()
  })

  it('should handle transfers with multiple debits', function *() {
    const transfer = this.multiDebitTransfer

    let transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[1].authorized

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('alice', 'alice')
      .send(transferWithoutAuthorization)
      .expect(201)
      .expect(_.assign({}, transferWithoutAuthorization, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .put(this.multiDebitTransfer.id)
      .auth('candice', 'candice')
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
      .end()
  })

  it('should handle transfers with multiple debits and multiple credits',
    function *() {
      const transfer = this.multiDebitAndCreditTransfer

      let transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[1].authorized

      yield this.request()
        .put(this.multiDebitAndCreditTransfer.id)
        .auth('alice', 'alice')
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      yield this.request()
        .put(this.multiDebitAndCreditTransfer.id)
        .auth('candice', 'candice')
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
        .end()
    })

  it('should return 200 if the http-signature is valid', function *() {
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
      .end()
  })

  it('should return 403 if the http-signature is invalid', function *() {
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
      .expect(403)
      .end()
  })
})
