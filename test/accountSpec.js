/*global describe, it*/
'use strict'
const fs = require('fs')
const _ = require('lodash')
const expect = require('chai').expect
const sinon = require('sinon')
const app = require('../src/services/app')
const Account = require('../src/models/db/account').Account
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')

const validator = require('./helpers/validator')

const publicKey = fs.readFileSync(__dirname + '/data/public.pem', 'utf8')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Accounts', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)
    yield dbHelper.init()

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleAccounts = _.cloneDeep(require('./data/accounts'))
    this.adminAccount = this.exampleAccounts.admin
    this.holdAccount = this.exampleAccounts.hold
    this.existingAccount = this.exampleAccounts.alice
    this.existingAccount2 = this.exampleAccounts.candice
    this.traderAccount = this.exampleAccounts.trader
    this.disabledAccount = this.exampleAccounts.disabledAccount

    // Reset database
    yield dbHelper.reset()

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

  describe('GET /accounts', function () {
    it('should return 200', function *() {
      const account1 = this.adminAccount
      const account2 = this.holdAccount
      const account3 = this.existingAccount
      const account4 = this.existingAccount2
      const account5 = this.traderAccount
      const account6 = this.disabledAccount
      // Passwords are not returned
      delete account1.password
      delete account2.password
      delete account3.password
      delete account4.password
      delete account5.password
      delete account6.password
      yield this.request()
        .get('/accounts')
        .auth('admin', 'admin')
        .expect([account1, account2, account3, account4, account5, account6])
        .expect(validator.validateAccounts)
        .expect(200)
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
            connector: 'http://localhost:4321'
          }
        ])
        .expect(validator.validateAccounts)
        .end()
    })
  })

  describe('GET /accounts/:uuid', function () {
    it('should return 200 for an account that exists', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(validator.validateAccount)
        .end()
    })

    it('should return 404 when the account does not exist', function *() {
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .auth('admin', 'admin')
        .expect(404)
        .end()
    })

    it('should return 200 + partial data, when not authenticated', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .expect(200, {
          id: this.existingAccount.id,
          name: this.existingAccount.name,
          ledger: 'http://localhost'
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('should return 404 when not authenticated + nonexistent target', function *() {
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .expect(404)
        .end()
    })

    it('should return 403 with invalid credentials', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('bob', 'bob')
        .expect(403)
        .end()
    })

    it('should return partial data for valid but unauthorized credentials', function *() {
      yield this.request()
        .get(this.existingAccount2.id)
        .auth('alice', 'alice')
        .expect(200, {
          id: this.existingAccount2.id,
          name: this.existingAccount2.name,
          ledger: 'http://localhost'
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('should strip out the password field', function *() {
      const account = this.existingAccount
      const accountWithoutPassword = _.clone(account)
      delete accountWithoutPassword.password
      accountWithoutPassword.ledger = 'http://localhost'
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(accountWithoutPassword)
        .expect(validator.validateAccount)
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
        .expect(validator.validateAccount)
        .end()
    })

    it('should return the disabled field as a boolean for an admin user', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.is_disabled !== 'boolean') {
            throw new Error('disabled should be returned as a boolean')
          }
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('sholuld allow an admin user to view a disabled account', function *() {
      yield this.request()
        .get(this.disabledAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(validator.validateAccount)
        .end()
    })

    it('should return a 403 when a non-admin user tries to view a disabled account', function *() {
      yield this.request()
        .get(this.disabledAccount.id)
        .auth('disabled', 'disabled')
        .expect(403)
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
        .expect(validator.validateAccount)
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
        .expect(validator.validateAccount)
        .end()

      // Check balances
      const row = yield Account.findByName('alice')
      expect(row.balance).to.equal(90)
    })

    it('should return a 400 if the account name in the URL does not match the account name in the JSON', function *() {
      const existingAccount = this.existingAccount
      const newAccount = this.exampleAccounts.bob

      delete existingAccount.password

      yield this.request()
      .put(newAccount.id)
      .auth('admin', 'admin')
      .send(existingAccount)
      .expect(400)
      .end()
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
        .expect(validator.validateAccount)
        .end()

      // Check balances
      const user = (yield Account.findByName('eve'))
      expect(user.public_key).to.equal(publicKey)
    })
  })
})
