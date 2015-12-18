/*global describe, it*/
'use strict'
const fs = require('fs')
const _ = require('lodash')
const expect = require('chai').expect
const sinon = require('sinon')
const app = require('../app')
const Account = require('../src/models/account').Account
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')

const publicKey = fs.readFileSync(__dirname + '/data/public.pem', 'utf8')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Accounts', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleAccounts = _.cloneDeep(require('./data/accounts'))
    this.adminAccount = this.exampleAccounts.admin
    this.holdAccount = this.exampleAccounts.hold
    this.existingAccount = this.exampleAccounts.alice
    this.traderAccount = this.exampleAccounts.trader

    // Reset database
    yield dbHelper.reset()

    // Store some example data
    yield dbHelper.addAccounts([
      this.adminAccount,
      this.holdAccount,
      this.existingAccount,
      this.traderAccount
    ])
  })

  describe('GET /accounts', function () {
    it('should return 200', function *() {
      const account1 = this.adminAccount
      const account2 = this.holdAccount
      const account3 = this.existingAccount
      const account4 = this.traderAccount
      // Passwords are not returned
      delete account1.password
      delete account2.password
      delete account3.password
      delete account4.password
      yield this.request()
        .get('/accounts')
        .auth('admin', 'admin')
        .expect(200)
        .expect([account1, account2, account3, account4])
        .end()
    })

    it('should return 401/403 if the user isn\'t an admin', function *() {
      yield this.request()
        .get('/accounts')
        .expect(401)
        .end()
      yield this.request()
        .get('/accounts')
        .auth('alice', 'alice')
        .expect(403)
        .end()
    })
  })

  describe('GET /connectors', function () {
    it('should return 200', function *() {
      yield this.request()
        .get('/connectors')
        .expect(200, [
          {
            id: 'http://localhost/accounts/trader',
            name: 'trader',
            identity: 'http://localhost:4321'
          }
        ])
        .end()
    })
  })

  describe('GET /accounts/:uuid', function () {
    it('should return 200 for an account that exists', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .end()
    })

    it('should return 404 when the account does not exist', function *() {
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .auth('admin', 'admin')
        .expect(404)
        .end()
    })

    it('should return 401 when not authenticated', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .expect(401)
        .end()
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .expect(401)
        .end()
    })

    it('should return 403 when not authorized', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('bob', 'bob')
        .expect(403)
        .end()
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .auth('alice', 'alice')
        .expect(403)
        .end()
    })

    it('should strip out the password field', function *() {
      const account = this.existingAccount
      const accountWithoutPassword = _.clone(account)
      delete accountWithoutPassword.password
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(accountWithoutPassword)
        .end()
    })

    it('should return the balance as a string', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.balance !== 'string') {
            throw new Error('Balance should be a string')
          }
        })
        .end()
    })
  })

  describe('PUT /accounts/:uuid', function () {
    it('should return 201', function *() {
      const account = this.exampleAccounts.bob
      // Passwords are not returned
      delete account.password
      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)
        .expect(account)
        .end()

      // Check balances
      expect((yield Account.findByName('bob')).getDataExternal()).to.deep.equal(account)
    })

    it('should return 200 if the account already exists', function *() {
      const account = this.existingAccount

      // Update balance
      account.balance = '90'

      // Passwords are not returned
      delete account.password

      yield this.request()
        .put(this.existingAccount.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(200)
        .expect(account)
        .end()

      // Check balances
      const row = yield Account.findByName('alice')
      expect(row.balance).to.equal(90)
    })
  })

  describe('PUT /accounts/:uuid with public_key', function () {
    it('should return 201', function *() {
      const account = this.exampleAccounts.eve
      account.public_key = publicKey
      delete account.password
      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(function (res) {
          expect(res.body.name).to.equal('eve')
          // public_key is not returned
          expect(res.body.public_key).to.equal(undefined)
        })
        .expect(201)
        .end()

      // Check balances
      const user = (yield Account.findByName('eve'))
      expect(user.public_key).to.equal(publicKey)
    })
  })

  describe('Account#findEntry', function () {
    it('returns an Entry', function *() {
      yield dbHelper.addAccounts([this.exampleAccounts.bob])
      const transfer = _.cloneDeep(require('./data/transferSimple'))
      const transfer1ID = '155dff3f-4915-44df-a707-acc4b527bcbd'
      const transfer2ID = '155dff3f-4915-44df-a707-acc4b527bcbe'
      transfer.id = 'http://localhost/transfers/' + transfer1ID
      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .end()

      let now = new Date()

      // MySQL uses second-resolution, so we need to tick 1000ms to
      // ensure success.
      this.clock.tick(1000)

      transfer.id = 'http://localhost/transfers/' + transfer2ID
      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .end()

      const account = yield Account.findByName('alice')
      const entry1 = yield account.findEntry(now)
      const entry2 = yield account.findEntry(new Date())

      expect(entry1.transfer_id).to.equal(transfer1ID)
      expect(entry1.account).to.equal(account.primary)
      expect(entry1.balance).to.equal(90)
      expect(entry2.transfer_id).to.equal(transfer2ID)
      expect(entry2.account).to.equal(account.primary)
      expect(entry2.balance).to.equal(80)
    })
  })
})
