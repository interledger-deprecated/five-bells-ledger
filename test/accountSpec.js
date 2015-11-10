/*global describe, it*/
'use strict'
const fs = require('fs')
const _ = require('lodash')
const expect = require('chai').expect
const app = require('../app')
const Account = require('../src/models/account').Account
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')

const publicKey = fs.readFileSync(__dirname + '/data/public.pem', 'utf8')

describe('Accounts', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    // Define example data
    this.exampleAccounts = _.cloneDeep(require('./data/accounts'))
    this.adminAccount = this.exampleAccounts.admin
    this.existingAccount = this.exampleAccounts.alice

    // Reset database
    yield dbHelper.reset()

    // Store some example data
    yield dbHelper.addAccounts([this.adminAccount, this.existingAccount])
  })

  describe('GET /accounts', function () {
    it('should return 200', function *() {
      const account1 = this.adminAccount
      const account2 = this.existingAccount
      // Passwords are not returned
      delete account1.password
      delete account2.password
      yield this.request()
        .get('/accounts')
        .expect(200)
        .expect([account1, account2])
        .end()
    })

    it('should return 200 with an empty array if there are no accounts', function *() {
      yield Account.truncate()
      yield this.request()
        .get('/accounts')
        .expect(200)
        .expect([])
        .end()
    })
  })

  describe('GET /accounts/:uuid', function () {
    it('should return 200 for an account that exists', function *() {
      yield this.request()
        .get(this.existingAccount.id)
        .expect(200)
        .end()
    })

    it('should return 404 when the account does not exist', function *() {
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .expect(404)
        .end()
    })

    it('should strip out the password field', function *() {
      const account = this.existingAccount
      const accountWithoutPassword = _.clone(account)
      delete accountWithoutPassword.password
      yield this.request()
        .get(this.existingAccount.id)
        .expect(200)
        .expect(accountWithoutPassword)
        .end()
    })

    it('should return the balance as a string', function *() {
      yield this.request()
        .get(this.existingAccount.id)
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
      expect((yield Account.findById('bob')).getDataExternal()).to.deep.equal(account)
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
      const row = yield Account.findById('alice')
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
          expect(res.body.name).to.equal('Eve')
          // public_key is not returned
          expect(res.body.public_key).to.equal(undefined)
        })
        .expect(201)
        .end()

      // Check balances
      const user = (yield Account.findById('eve'))
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
      transfer.id = 'http://localhost/transfers/' + transfer2ID
      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .end()

      const entry1 = yield (yield Account.findById('alice')).findEntry(now)
      expect(entry1.transfer_id).to.equal(transfer1ID)
      expect(entry1.account).to.equal('alice')
      expect(entry1.balance).to.equal(90)
      const entry2 = yield (yield Account.findById('alice')).findEntry(new Date())
      expect(entry2.transfer_id).to.equal(transfer2ID)
      expect(entry2.account).to.equal('alice')
      expect(entry2.balance).to.equal(80)
    })
  })
})
