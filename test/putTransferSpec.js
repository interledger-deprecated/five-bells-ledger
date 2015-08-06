/*global describe, it*/
'use strict'
const _ = require('lodash')
const expect = require('chai').expect
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../app')
const db = require('../services/db')
const logger = require('../services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('@ripple/five-bells-shared/testHelpers/log')
const sinon = require('sinon')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('PUT /transfers/:id', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

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

    // Reset database
    yield dbHelper.reset()

    // Store some example data
    yield db.put(['accounts'], require('./data/accounts'))
  })

  afterEach(function *() {
    nock.cleanAll()
    this.clock.restore()
  })

  /* Invalid transfer objects */

  it('should return 400 if the transfer ID is invalid', function *() {
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    delete transfer.id
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id + 'bogus')
      .send(transfer)
      .expect(400)
      .end()
  })

  it('should return 400 if the transfer is invalid', function *() {
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    transfer.debits[0].amount = 'bogus'
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .send(transfer)
      .expect(400)
      .end()
  })

  it('should return 422 if the source amount is zero', function *() {
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    transfer.debits[0].amount = '0'
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the destination amount is zero', function *() {
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    transfer.credits[0].amount = '0'
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the sender doesn't have enough money", function *() {
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    transfer.debits[0].amount = '101'
    transfer.credits[0].amount = '101'
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the sender doesn't exist", function *() {
    const transfer = this.formatId(this.transferNoAuthorization, '/transfers/')
    transfer.debits[0].account = 'alois'
    yield this.request()
      .put('/transfers/' + this.transferNoAuthorization.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if the recipient doesn't exist", function *() {
    const transfer = this.formatId(this.transferNoAuthorization, '/transfers/')
    transfer.credits[0].account = 'blob'
    yield this.request()
      .put('/transfers/' + this.transferNoAuthorization.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it("should return 422 if source and destination amounts don't match", function *() {
    const transfer = this.formatId(this.transferNoAuthorization, '/transfers/')
    transfer.credits[0].amount = '122'
    yield this.request()
      .put('/transfers/' + this.transferNoAuthorization.id)
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if the signature is invalid', function *() {
    const transfer = this.formatId(this.executedTransfer, '/transfers/')
    transfer.execution_condition_fulfillment.signature = 'aW52YWxpZA=='

    yield this.request()
      .put('/transfers/' + this.executedTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .end()
  })

  it('should return 422 if a transfer is modified after its ' +
    'expiry date', function *() {
      const transfer = this.formatId(this.transferWithExpiry, '/transfers/')
      delete transfer.debits[0].authorized

      const transferNoAuthorization = _.cloneDeep(transfer)
      delete transferNoAuthorization.debits[1].authorized

      yield this.request()
        .put('/transfers/' + this.transferWithExpiry.id)
        .send(transferNoAuthorization)
        .expect(201)
        .expect(_.assign({}, transferNoAuthorization, {
          state: 'proposed',
          timeline: {
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      this.clock.tick(200)

      yield this.request()
        .put('/transfers/' + this.transferWithExpiry.id)
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
    let transfer = this.formatId(this.transferWithExpiry, '/transfers/')
    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    let transferWithoutExpiry = _.cloneDeep(transfer)
    delete transferWithoutExpiry.expires_at

    yield this.request()
      .put('/transfers/' + this.transferWithExpiry.id)
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    this.clock.tick(200)

    yield this.request()
      .put('/transfers/' + this.transferWithExpiry.id)
      .send(transferWithoutExpiry)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
      .end()
  })

  it('should return 422 if the credits are greater than the debits', function *() {
    const transfer = this.formatId(this.multiDebitAndCreditTransfer, '/transfers/')
    transfer.credits[0].amount = String(parseFloat(transfer.credits[0].amount) + 0.00000001)

    yield this.request()
      .put('/transfers/' + this.multiDebitAndCreditTransfer.id)
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
      .end()
  })

  it('should return 422 if the debits are greater than the credits', function *() {
    const transfer = this.formatId(this.multiDebitAndCreditTransfer, '/transfers/')
    transfer.debits[0].amount = String(parseFloat(transfer.debits[0].amount) + 0.00000001)

    yield this.request()
      .put('/transfers/' + this.multiDebitAndCreditTransfer.id)
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
      .end()
  })

  /* Idempotency */

  it('should return 201 for a newly created transfer', function *() {
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          pre_executed_at: '2015-06-16T00:00:00.000Z',
          pre_prepared_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    // Check balances
    expect(yield db.get(['accounts', 'alice', 'balance'])).to.equal(90)
    expect(yield db.get(['accounts', 'bob', 'balance'])).to.equal(10)
  })

  it('should return 200 if the transfer already exists', function *() {
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          pre_executed_at: '2015-06-16T00:00:00.000Z',
          pre_prepared_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          pre_executed_at: '2015-06-16T00:00:00.000Z',
          pre_prepared_at: '2015-06-16T00:00:00.000Z',
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
      .put('/transfers/' + this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transferWithoutId)
      .expect(201)
      .expect(_.assign({}, this.formatId(this.exampleTransfer, '/transfers/'),
        {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            pre_executed_at: '2015-06-16T00:00:00.000Z',
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
      .end()

    // Check balances
    expect(yield db.get(['accounts', 'alice', 'balance'])).to.equal(90)
    expect(yield db.get(['accounts', 'bob', 'balance'])).to.equal(10)
  })

  it('should accept a transfer with an upper case ID but convert the ID ' +
    'to lower case', function *() {
      const transfer = _.cloneDeep(this.exampleTransfer)
      // This URI uppercases everything that should be case-insensitive
      transfer.id = 'HTTP://LOCALHOST/transfers/' + transfer.id.toUpperCase()

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          id: transfer.id.toLowerCase(),
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            pre_executed_at: '2015-06-16T00:00:00.000Z',
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  /* Authorization */

  it('should set the transfer state to "proposed" and authorized to false ' +
    'if no authorization is provided', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/')
      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
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
    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .auth(transfer.debits[0].account + ':notrealpassword')
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
      const transfer = this.formatId(this.exampleTransfer, '/transfers/')
      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
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
      const transfer = this.formatId(this.exampleTransfer, '/transfers/')

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
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
      const transfer = this.formatId(this.multiDebitTransfer, '/transfers/')

      yield this.request()
        .put('/transfers/' + this.multiDebitTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(403)
        .expect(function (res) {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid attempt to authorize debit')
        })
        .end()
    })

  it('should keep the state as "proposed" if not all debits are authorized',
    function *() {
      const transfer = this.formatId(this.multiDebitTransfer, '/transfers/')
      delete transfer.debits[1].authorized

      yield this.request()
        .put('/transfers/' + this.multiDebitTransfer.id)
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
      let transfer = this.formatId(this.multiDebitTransfer, '/transfers/')
      transfer.execution_condition = this.executedTransfer.execution_condition
      let incompleteTransfer = _.cloneDeep(transfer)
      delete incompleteTransfer.debits[1].authorized

      yield this.request()
        .put('/transfers/' + this.multiDebitTransfer.id)
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
        .put('/transfers/' + this.multiDebitTransfer.id)
        .auth('candice', 'candice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'prepared',
          timeline: {
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should execute the transfer if it is authorized and ' +
    'there is no execution condition', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/')

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            pre_executed_at: '2015-06-16T00:00:00.000Z',
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should return 403 if an unauthorized user attempts to ' +
    'modify the "authorized" field', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/')
      let incompleteTransfer = _.cloneDeep(transfer)
      delete incompleteTransfer.debits[0].authorized

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
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
        .put('/transfers/' + this.exampleTransfer.id)
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
      let transfer = this.formatId(this.exampleTransfer, '/transfers/')

      let unauthorizedTransfer = _.cloneDeep(transfer)
      delete unauthorizedTransfer.debits[0].authorized

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
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
        .put('/transfers/' + this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            pre_executed_at: '2015-06-16T00:00:00.000Z',
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

    })

  it('should allow additional authorizations to be added after ' +
    'the transfer is proposed', function *() {
      let transfer = this.formatId(this.multiDebitTransfer, '/transfers/')

      let unauthorizedTransfer = _.cloneDeep(transfer)
      delete unauthorizedTransfer.debits[0].authorized
      delete unauthorizedTransfer.debits[1].authorized

      yield this.request()
        .put('/transfers/' + this.multiDebitTransfer.id)
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
        .put('/transfers/' + this.multiDebitTransfer.id)
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
        .put('/transfers/' + this.multiDebitTransfer.id)
        .auth('candice', 'candice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            pre_executed_at: '2015-06-16T00:00:00.000Z',
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should set the transfer state to "proposed" if no authorization is given',
    function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/')
      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
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
      const transfer = this.formatId(this.exampleTransfer, '/transfers/')

      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
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
        .put('/transfers/' + this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.001Z',
            pre_executed_at: '2015-06-16T00:00:00.001Z',
            pre_prepared_at: '2015-06-16T00:00:00.001Z',
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
      const transfer = this.formatId(this.executedTransfer, '/transfers/')
      delete transfer.execution_condition_fulfillment

      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
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
        .put('/transfers/' + this.executedTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'prepared',
          timeline: {
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  it('should update the state from "prepared" to "executed" ' +
  'when the execution criteria is met',
    function *() {
      const transfer = this.formatId(this.executedTransfer, '/transfers/')
      delete transfer.state

      const transferWithoutConditionFulfillment = _.cloneDeep(transfer)
      delete transferWithoutConditionFulfillment.execution_condition_fulfillment

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
        .auth('alice', 'alice')
        .send(transferWithoutConditionFulfillment)
        .expect(201)
        .expect(_.assign({}, transferWithoutConditionFulfillment, {
          state: 'prepared',
          timeline: {
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            pre_executed_at: '2015-06-16T00:00:00.000Z',
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()
    })

  /* Subscriptions */

  it('should trigger subscriptions', function *() {
    const subscription = require('./data/subscription1.json')
    yield db.create(['subscriptions'], subscription)

    const notification = nock('http://subscriber.example')
      .post('/notifications')
      .reply(204)

    const transfer = this.formatId(this.exampleTransfer, '/transfers/')
    yield this.request()
      .put('/transfers/' + this.exampleTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          pre_executed_at: '2015-06-16T00:00:00.000Z',
          pre_prepared_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    notification.done()
  })

  /* Multiple credits and/or debits */

  it('should handle transfers with multiple credits', function *() {
    const transfer = this.formatId(this.multiCreditTransfer, '/transfers/')

    yield this.request()
      .put('/transfers/' + this.multiCreditTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          pre_executed_at: '2015-06-16T00:00:00.000Z',
          pre_prepared_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .get('/accounts/' + this.multiCreditTransfer.credits[0].account)
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/bob',
        name: 'Bob',
        balance: '10'
      })
      .end()

    yield this.request()
      .get('/accounts/' + this.multiCreditTransfer.credits[1].account)
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/dave',
        name: 'Dave',
        balance: '10'
      })
      .end()
  })

  it('should handle transfers with multiple debits', function *() {
    const transfer = this.formatId(this.multiDebitTransfer, '/transfers/')

    let transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[1].authorized

    yield this.request()
      .put('/transfers/' + this.multiDebitTransfer.id)
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
      .put('/transfers/' + this.multiDebitTransfer.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(200)
      .expect(_.assign({}, transfer, {
        state: 'executed',
        timeline: {
          executed_at: '2015-06-16T00:00:00.000Z',
          pre_executed_at: '2015-06-16T00:00:00.000Z',
          pre_prepared_at: '2015-06-16T00:00:00.000Z',
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }))
      .end()

    yield this.request()
      .get('/accounts/' + this.multiDebitTransfer.debits[0].account)
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/alice',
        name: 'Alice',
        balance: '90'
      }))
      .end()

    yield this.request()
      .get('/accounts/' + this.multiDebitTransfer.debits[1].account)
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/candice',
        name: 'Candice',
        balance: '40'
      }))
      .end()
  })

  it('should handle transfers with multiple debits and multiple credits',
    function *() {
      const transfer = this.formatId(this.multiDebitAndCreditTransfer, '/transfers/')

      let transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[1].authorized

      yield this.request()
        .put('/transfers/' + this.multiDebitAndCreditTransfer.id)
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
        .put('/transfers/' + this.multiDebitAndCreditTransfer.id)
        .auth('candice', 'candice')
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {
          state: 'executed',
          timeline: {
            executed_at: '2015-06-16T00:00:00.000Z',
            pre_executed_at: '2015-06-16T00:00:00.000Z',
            pre_prepared_at: '2015-06-16T00:00:00.000Z',
            prepared_at: '2015-06-16T00:00:00.000Z',
            proposed_at: '2015-06-16T00:00:00.000Z'
          }
        }))
        .end()

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.debits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/alice',
          name: 'Alice',
          balance: '50'
        }))
        .end()

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.debits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/candice',
          name: 'Candice',
          balance: '30'
        }))
        .end()

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.credits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/bob',
          name: 'Bob',
          balance: '30'
        }))
        .end()

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.credits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/dave',
          name: 'Dave',
          balance: '40'
        }))
        .end()
    })

})
