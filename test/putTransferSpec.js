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

  before(async function () {
    await dbHelper.init()
  })

  beforeEach(async function () {
    appHelper.create(this, app)
    await dbHelper.clean()

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
    this.fromZeroMinBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromZeroMinBalance'))
    this.fromFiniteMinBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromFiniteMinBalance'))
    this.fromInfiniteMinBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromInfiniteMinBalance'))
    this.fromNoBalanceAccountTransfer = _.cloneDeep(require('./data/transfers/fromNoBalanceAccount'))
    this.noBalanceAccount = _.cloneDeep(accounts.noBalance)

    // Store some example data
    accounts.eve.public_key = publicKey
    await dbHelper.addAccounts(_.values(_.omit(accounts, 'noBalance')))
  })

  afterEach(async function () {
    nock.cleanAll()
    this.clock.restore()
  })

  /* Invalid transfer objects */

  it('should return 400 if the transfer ID is invalid', async function () {
    const transfer = _.clone(this.exampleTransfer)
    delete transfer.id

    await this.request()
      .put(this.exampleTransfer.id + 'bogus')
      .auth('alice', 'alice')
      .send(transfer)
      .expect(400)
  })

  it('should return 400 if the transfer is invalid', async function () {
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = 'bogus'
    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(400)
  })

  it('should return 422 if the source amount is zero', async function () {
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = '0'
    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it('should return 422 if the destination amount is zero', async function () {
    const transfer = this.exampleTransfer
    transfer.credits[0].amount = '0'
    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it("should return 422 if the sender doesn't have enough money", async function () {
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = '101'
    transfer.credits[0].amount = '101'
    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it('should return 422 if the sender amount precision is too high', async function () {
    assert.strictEqual(config.amount.precision, 19) // default precision is 19
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = '991234567890.123456789'
    transfer.credits[0].amount = '991234567890.123456789'
    await this.request()
      .put(transfer.id)
      .auth('bob', 'bob')
      .send(transfer)
      .expect(422)
  })

  it('should return 422 if the sender amount scale is too high', async function () {
    assert.strictEqual(config.amount.scale, 9) // default scale is 9
    const transfer = this.exampleTransfer
    transfer.debits[0].amount = '1.1234567899'
    transfer.credits[0].amount = '1.1234567899'
    await this.request()
      .put(transfer.id)
      .auth('bob', 'bob')
      .send(transfer)
      .expect(422)
  })

  it("should return 422 if the sender doesn't exist", async function () {
    const transfer = this.transferNoAuthorization
    transfer.debits[0].account = 'http://localhost/accounts/alois'
    await this.request()
      .put(this.transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it("should return 422 if the recipient doesn't exist", async function () {
    const transfer = this.transferNoAuthorization
    transfer.credits[0].account = 'http://localhost/accounts/blob'
    await this.request()
      .put(this.transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it("should return 422 if source and destination amounts don't match", async function () {
    const transfer = this.transferNoAuthorization
    transfer.credits[0].amount = '122'
    await this.request()
      .put(this.transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it('should return 200 if a transfer is posted with the same expiry date',
    async function () {
      const transfer = _.cloneDeep(this.transferWithExpiry)
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized
      transfer.expires_at = (new Date(Date.now() + 10000)).toISOString()

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      this.clock.tick(2000)

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(validator.validateTransfer)
    })

  it('should return 200 if a transfer is re-posted with the same amount in a different format',
    async function () {
      const transfer = _.cloneDeep(this.proposedTransfer)
      transfer.credits[0].amount = '10'

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)

      this.clock.tick(2000)

      transfer.credits[0].amount = '10.0'
      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(200)
        .expect(validator.validateTransfer)
    })

  it('should return 422 if a transfer is modified after its ' +
    'expiry date', async function () {
    const transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized

    const transferNoAuthorization = _.cloneDeep(transfer)
    delete transferNoAuthorization.debits[1].authorized

    await this.request()
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

    this.clock.tick(2000)

    await this.request()
      .put(this.transferWithExpiry.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('ExpiredTransferError')
        expect(res.body.message).to.equal('Cannot modify transfer after ' +
          'expires_at date')
      })
  })

  it('should return 422 if the expires_at field is removed', async function () {
    let transfer = this.transferWithExpiry
    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    let transferWithoutExpiry = _.cloneDeep(transfer)
    delete transferWithoutExpiry.expires_at

    await this.request()
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

    this.clock.tick(2000)

    await this.request()
      .put(this.transferWithExpiry.id)
      .auth('alice', 'alice')
      .send(transferWithoutExpiry)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
  })

  it('should return 422 if the credits are greater than the debits', async function () {
    const transfer = this.multiDebitAndCreditTransfer
    transfer.credits[0].amount = String(parseFloat(transfer.credits[0].amount) + 0.01)

    await this.request()
      .put(this.multiDebitAndCreditTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
  })

  it('should return 422 if the debits are greater than the credits', async function () {
    const transfer = this.multiDebitAndCreditTransfer
    transfer.debits[0].amount = String(parseFloat(transfer.debits[0].amount) + 0.01)

    await this.request()
      .put(this.multiDebitAndCreditTransfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnprocessableEntityError')
        expect(res.body.message).to.equal('Total credits must equal total debits')
      })
  })

  /* Disabled Accounts */
  it('should return a 422 for a transfer from a disabled account', async function () {
    const transfer = this.disabledTransferFrom
    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it('should return 422 for a transfer to a disabled account', async function () {
    const transfer = this.disabledTransferTo
    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it('should allow a transfer involving a disabled account to complete execution', async function () {
    const transferNoAuthorization = _.cloneDeep(this.transferNoAuthorization)
    /* propose transfer: Alice -> Bob */
    await this.request()
      .put(transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transferNoAuthorization)
      .expect(201)
      .expect(validator.validateTransfer)

    /* Disable bobs's account */
    await upsertAccount({name: accounts.bob.name, is_disabled: true})

    transferNoAuthorization.debits[0].authorized = true

    /* execute transfer: Alice -> Bob */
    await this.request()
      .put(transferNoAuthorization.id)
      .auth('alice', 'alice')
      .send(transferNoAuthorization)
      .expect(200)
      .expect(validator.validateTransfer)

    await this.request()
    .get(this.executedTransfer.credits[0].account)
    .auth('admin', 'admin')
    .expect(200)
    .expect({
      id: 'http://localhost/accounts/bob',
      name: 'bob',
      balance: '10',
      is_disabled: true,
      ledger: 'http://localhost',
      minimum_allowed_balance: '0'
    })
    .expect(validator.validateAccount)

    await this.request()
      .get(this.executedTransfer.debits[0].account)
      .auth('alice', 'alice')
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/alice',
        name: 'alice',
        balance: '90',
        is_disabled: false,
        ledger: 'http://localhost',
        minimum_allowed_balance: '0'
      })
      .expect(validator.validateAccount)
  })

  /* Idempotency */

  it('should return 201 for a newly created transfer', async function () {
    const transfer = this.exampleTransfer
    await this.request()
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

    // Check balances
    expect((await getAccount('alice')).balance).to.equal(90)
    expect((await getAccount('bob')).balance).to.equal(10)
  })

  it('should return 200 if the transfer already exists', async function () {
    const transfer = this.exampleTransfer
    await this.request()
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

    await this.request()
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
  })

  it('should return 201 if the transfer does not have an ID set', async function () {
    const transferWithoutId = _.cloneDeep(this.exampleTransfer)
    delete transferWithoutId.id
    await this.request()
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

    // Check balances
    expect((await getAccount('alice')).balance).to.equal(90)
    expect((await getAccount('bob')).balance).to.equal(10)
  })

  it('should maintain correct precision', async function () {
    const transferWithoutId = _.cloneDeep(this.exampleTransfer)
    delete transferWithoutId.id
    transferWithoutId.debits[0].amount = transferWithoutId.credits[0].amount = '5.01'
    for (let i = 0; i < 2; i++) {
      const transferID = this.exampleTransfer.id.slice(0, -1) + i
      await this.request()
        .put(transferID)
        .auth('alice', 'alice')
        .send(transferWithoutId)
        .expect(201)
    }
    expect((await getAccount('alice')).balance).to.equal(89.98)
  })

  it('should accept a transfer with an upper case ID but convert the ID ' +
    'to lower case', async function () {
    const transfer = _.cloneDeep(this.exampleTransfer)
    // This URI uppercases everything that should be case-insensitive
    const prefix = 'HTTP://LOCALHOST/transfers/'
    transfer.id = prefix + transfer.id.slice(prefix.length)

    await this.request()
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
  })

  /* Authorization */

  it('should set the transfer state to "proposed" and authorized to false ' +
    'if no authorization is provided', async function () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    await this.request()
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
  })

  it('should return 403 if invalid authorization is given', async function () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    await this.request()
      .put(transfer.id)
      .auth(transfer.debits[0].account + ':notrealpassword')
      .send(transferWithoutAuthorization)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Unknown or invalid account / password')
      })
  })

  it('should return 403 if password is missing', async function () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    await this.request()
      .put(transfer.id)
      .auth(transfer.debits[0].account + ':')
      .send(transferWithoutAuthorization)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Unknown or invalid account / password')
      })
  })

  it('should return 403 if authorization is provided that is irrelevant ' +
    'to the transfer', async function () {
    const transfer = this.exampleTransfer
    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    await this.request()
      .put(transfer.id)
      .auth('candice', 'candice')
      .send(transferWithoutAuthorization)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
  })

  it('should return 401 if authorized:true is set without any authentication',
    async function () {
      const transfer = this.exampleTransfer

      await this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(401)
    })

  it('should return 401 if authorized:false is set without any authentication',
    async function () {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized

      await this.request()
        .put(transfer.id)
        .send(transfer)
        .expect(401)
    })

  it('should return 403 if authentication invalid',
    async function () {
      const transfer = this.exampleTransfer

      await this.request()
        .put(transfer.id)
        .auth('alice', 'wrongPassword')
        .send(transfer)
        .expect(403)
        .expect((res) => {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid password')
        })
    })

  it('should return 403 if authorized:true is set for any debits that are ' +
    'not owned by the authorized account', async function () {
    const transfer = this.multiDebitTransfer

    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
  })

  it('should return 400 if an unauthorized debit is removed', async function () {
    const transfer = this.multiDebitTransfer

    delete transfer.debits[0].authorized
    delete transfer.debits[1].authorized

    await this.request()
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

    // Remove a debit and change credits to match
    transfer.debits = transfer.debits.slice(0, 1)
    transfer.credits[0].amount = '10'

    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
  })

  it('should keep the state as "proposed" if not all debits are authorized',
    async function () {
      const transfer = this.multiDebitTransfer
      delete transfer.debits[1].authorized

      await this.request()
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
    })

  it('should only set the state to "prepared" if all debits are authorized',
    async function () {
      let transfer = this.multiDebitTransfer
      transfer.execution_condition = this.executedTransfer.execution_condition
      let incompleteTransfer = _.cloneDeep(transfer)
      delete incompleteTransfer.debits[1].authorized

      await this.request()
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

      await this.request()
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
    })

  it('should execute the transfer if it is authorized and ' +
    'there is no execution condition', async function () {
    const transfer = this.exampleTransfer

    await this.request()
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
  })

  it('should execute the transfer if it is authorized by admin and ' +
    'there is no execution condition', async function () {
    const transfer = this.exampleTransfer

    await this.request()
      .put(this.exampleTransfer.id)
      .auth('admin', 'admin')
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
  })

  it('should return 403 if an unauthorized user attempts to ' +
    'modify the "authorized" field', async function () {
    const transfer = this.exampleTransfer
    let incompleteTransfer = _.cloneDeep(transfer)
    delete incompleteTransfer.debits[0].authorized

    await this.request()
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

    await this.request()
      .put(this.exampleTransfer.id)
      .auth('candice', 'candice')
      .send(transfer)
      .expect(403)
      .expect(function (res) {
        expect(res.body.id).to.equal('UnauthorizedError')
        expect(res.body.message).to.equal('Invalid attempt to authorize debit')
      })
  })

  it('should allow authorizations to be added after the transfer is proposed',
    async function () {
      let transfer = this.exampleTransfer

      let unauthorizedTransfer = _.cloneDeep(transfer)
      delete unauthorizedTransfer.debits[0].authorized

      await this.request()
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

      await this.request()
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
    })

  it('should allow additional authorizations to be added after ' +
    'the transfer is proposed', async function () {
    let transfer = this.multiDebitTransfer

    let unauthorizedTransfer = _.cloneDeep(transfer)
    delete unauthorizedTransfer.debits[0].authorized
    delete unauthorizedTransfer.debits[1].authorized

    await this.request()
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

    await this.request()
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

    await this.request()
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
  })

  it('should set the transfer state to "proposed" if no authorization is given',
    async function () {
      const transfer = this.exampleTransfer
      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      await this.request()
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
    })

  it('should update the state from "proposed" to "executed" when ' +
    'authorization is added and no execution condition is given', async function () {
    const transfer = this.exampleTransfer

    const transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[0].authorized

    await this.request()
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

    this.clock.tick(1)

    await this.request()
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
  })

  /* Execution conditions */
  it('should update the state from "proposed" to "prepared" when ' +
  'authorization is added and an execution condition is present',
    async function () {
      const transfer = this.executedTransfer

      const transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[0].authorized

      await this.request()
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

      await this.request()
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
    })

  /* Multiple credits and/or debits */
  it('should handle transfers with multiple credits', async function () {
    const transfer = this.multiCreditTransfer

    await this.request()
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

    await this.request()
      .get(this.multiCreditTransfer.credits[0].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/bob',
        name: 'bob',
        ledger: 'http://localhost',
        balance: '10',
        is_disabled: false,
        minimum_allowed_balance: '0'
      })
      .expect(validator.validateAccount)

    await this.request()
      .get(this.multiCreditTransfer.credits[1].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect({
        id: 'http://localhost/accounts/dave',
        name: 'dave',
        ledger: 'http://localhost',
        balance: '10',
        is_disabled: false,
        minimum_allowed_balance: '0'
      })
      .expect(validator.validateAccount)
  })

  it('should handle transfers with multiple debits', async function () {
    const transfer = this.multiDebitTransfer

    let transferWithoutAuthorization = _.cloneDeep(transfer)
    delete transferWithoutAuthorization.debits[1].authorized

    /* propose */
    await this.request()
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

    /* prepare */
    await this.request()
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

    await this.request()
      .get(this.multiDebitTransfer.debits[0].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/alice',
        name: 'alice',
        ledger: 'http://localhost',
        balance: '90',
        is_disabled: false,
        minimum_allowed_balance: '0'
      }))
      .expect(validator.validateAccount)

    await this.request()
      .get(this.multiDebitTransfer.debits[1].account)
      .auth('admin', 'admin')
      .expect(200)
      .expect(_.assign({}, {
        id: 'http://localhost/accounts/candice',
        name: 'candice',
        ledger: 'http://localhost',
        balance: '40',
        is_disabled: false,
        minimum_allowed_balance: '0'
      }))
      .expect(validator.validateAccount)
  })

  it('should handle transfers with multiple debits and multiple credits',
    async function () {
      const transfer = this.multiDebitAndCreditTransfer

      let transferWithoutAuthorization = _.cloneDeep(transfer)
      delete transferWithoutAuthorization.debits[1].authorized

      /* propose */
      await this.request()
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

      /* prepare (authorize) */
      await this.request()
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

      await this.request()
        .get(this.multiDebitAndCreditTransfer.debits[0].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/alice',
          name: 'alice',
          ledger: 'http://localhost',
          balance: '50',
          is_disabled: false,
          minimum_allowed_balance: '0'
        }))
        .expect(validator.validateAccount)

      await this.request()
        .get(this.multiDebitAndCreditTransfer.debits[1].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/candice',
          name: 'candice',
          ledger: 'http://localhost',
          balance: '30',
          is_disabled: false,
          minimum_allowed_balance: '0'
        }))
        .expect(validator.validateAccount)

      await this.request()
        .get(this.multiDebitAndCreditTransfer.credits[0].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/bob',
          name: 'bob',
          ledger: 'http://localhost',
          balance: '30',
          is_disabled: false,
          minimum_allowed_balance: '0'
        }))
        .expect(validator.validateAccount)

      await this.request()
        .get(this.multiDebitAndCreditTransfer.credits[1].account)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/dave',
          name: 'dave',
          ledger: 'http://localhost',
          balance: '40',
          is_disabled: false,
          minimum_allowed_balance: '0'
        }))
        .expect(validator.validateAccount)
    })

  it('should allow sender balance to go negative', async function () {
    await this.request()
      .put(this.fromFiniteMinBalanceAccountTransfer.id)
      .auth('finiteminbal', 'finiteminbal')
      .send(this.fromFiniteMinBalanceAccountTransfer)
      .expect(201)
      .expect(validator.validateTransfer)

    await this.request()
      .get(this.fromFiniteMinBalanceAccountTransfer.debits[0].account)
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

    await this.request()
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
  })

  it('should return the correct balance, if no balance is specified on account creation', async function () {
    const account = this.noBalanceAccount

    await this.request()
      .put(account.id)
      .auth('admin', 'admin')
      .send(account)
      .expect(201)

    await this.request()
      .put(this.fromNoBalanceAccountTransfer.id)
      .auth('nobalance', 'nobalance')
      .send(this.fromNoBalanceAccountTransfer)
      .expect(201)
      .expect(validator.validateTransfer)

    await this.request()
      .get(this.fromNoBalanceAccountTransfer.debits[0].account)
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

    await this.request()
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
  })

  it('should allow sender balance to go arbitrarily negative', async function () {
    const transfer = this.fromInfiniteMinBalanceAccountTransfer

    await this.request()
      .put(transfer.id)
      .auth('infiniteminbal', 'infiniteminbal')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)

    await this.request()
      .get(transfer.debits[0].account)
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

    await this.request()
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
  })

  it('should thow InsufficientFunds error when sender balance goes below minimum_allowed_balance', async function () {
    const transfer = this.fromZeroMinBalanceAccountTransfer

    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(422)
  })

  it('should return 200 if the http-signature is valid', async function () {
    const transfer = this.transferFromEve
    const date = (new Date()).toUTCString()
    const signature = crypto.createSign('RSA-SHA256')
      .update([
        '(request-target): put ' + parseURL(transfer.id).path,
        'date: ' + date
      ].join('\n'))
      .sign({key: privateKey, passphrase: '123456'}, 'base64')

    await this.request()
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
  })

  it('should return 401 if the http-signature is invalid', async function () {
    const transfer = this.transferFromEve
    const date = (new Date()).toUTCString()
    const signature = crypto.createSign('RSA-SHA256')
      .update([
        '(request-target): put ' + parseURL(transfer.id).path + '/wrong',
        'date: ' + date
      ].join('\n'))
      .sign({key: privateKey, passphrase: '123456'}, 'base64')

    await this.request()
      .put(transfer.id)
      .set('Date', date)
      .set('Authorization', 'Signature ' +
        'keyId="eve",' +
        'algorithm="rsa-sha256",' +
        'headers="(request-target) date",' +
        'signature="' + signature + '"')
      .send(transfer)
      .expect(401)
  })

  describe('FEATURE_CREDIT_AUTH=true', function () {
    before(function () { config.features.hasCreditAuth = true })
    after(function () { config.features.hasCreditAuth = false })

    it('should return 403 if authorized:true is set for any credits that are ' +
    'not owned by the authorized account', async function () {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized
      transfer.credits[0].authorized = true

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(403)
        .expect(function (res) {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid attempt to authorize credit')
        })
    })

    it('should execute the transfer if it is authorized and ' +
    'there is no execution condition', async function () {
      const transfer = this.exampleTransfer

      await this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          state: 'proposed',
          timeline: { proposed_at: '2015-06-16T00:00:00.000Z' }
        }))
        .expect(validator.validateTransfer)

      transfer.credits[0].authorized = true
      await this.request()
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
    })
  })

  describe('rejection', function () {
    it('should return 403 if rejected:true is set for any credits that are ' +
    'not owned by the authorized account', async function () {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized
      transfer.credits[0].rejected = true

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(403)
        .expect(function (res) {
          expect(res.body.id).to.equal('UnauthorizedError')
          expect(res.body.message).to.equal('Invalid attempt to reject credit')
        })
    })

    it('should reject a proposed transfer', async function () {
      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized

      await this.request()
        .put(this.exampleTransfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          state: 'proposed',
          timeline: { proposed_at: '2015-06-16T00:00:00.000Z' }
        }))
        .expect(validator.validateTransfer)

      transfer.credits[0].rejected = true
      transfer.credits[0].rejection_message = {
        code: '123',
        name: 'Error',
        message: 'error 1',
        triggered_by: 'example.red.bob',
        additional_info: {}
      }
      await this.request()
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
    })

    it('should not reject an executed transfer', async function () {
      const transfer = this.exampleTransfer

      await this.request()
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

      transfer.credits[0].rejected = true
      transfer.credits[0].rejection_message = {
        code: '123',
        name: 'Error',
        message: 'error 1',
        triggered_by: 'example.red.bob',
        additional_info: {}
      }
      await this.request()
        .put(this.exampleTransfer.id)
        .auth('bob', 'bob')
        .send(transfer)
        .expect(400)
        .expect(function (res) {
          expect(res.body.id).to.equal('InvalidModificationError')
          expect(res.body.message).to.equal('Transfers in state executed may not be rejected')
        })
    })
  })

  describe('sanity checks', function () {
    it('should return the same transfer as was PUT', async function () {
      const transfer = _.cloneDeep(this.multiDebitAndCreditTransfer)
      delete transfer.debits[1].authorized
      transfer.debits[0].memo = {message: 'TEST MEMO'}

      await this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)

      const addedData = {
        state: 'proposed',
        timeline: {
          proposed_at: '2015-06-16T00:00:00.000Z'
        }
      }
      await this.request()
        .get(transfer.id)
        .auth('alice', 'alice')
        .expect(200)
        .expect(_.assign(addedData, transfer))
    })
  })

  it('returns 413 on oversized requests', async function () {
    const transfer = this.exampleTransfer
    transfer.foo = (Buffer.alloc((64 * 1024) + 1)).toString()
    await this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(413)
  })
})
