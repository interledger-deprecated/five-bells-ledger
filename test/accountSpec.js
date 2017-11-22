'use strict'

const mock = require('mock-require')
const fs = require('fs')
const _ = require('lodash')
const expect = require('chai').expect
const assert = require('chai').assert
const sinon = require('sinon')
const app = require('../src/services/app')
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('./helpers/log')
const getAccount = require('../src/models/db/accounts').getAccount
const convertToExternal = require('../src/models/converters/accounts')
  .convertToExternalAccount
const seedDB = require('../src/lib/seed-db')
const loadConfig = require('../src/lib/config')
const hashPassword = require('five-bells-shared/utils/hashPassword')

const validator = require('./helpers/validator')

const publicKey = fs.readFileSync('./test/data/public.pem', 'utf8')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Accounts', function () {
  logHelper(logger)

  before(async function () {
    await dbHelper.init()
  })

  beforeEach(async function () {
    appHelper.create(this, app)
    await dbHelper.clean()

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleAccounts = _.cloneDeep(require('./data/accounts'))
    this.adminAccount = this.exampleAccounts.admin
    this.existingAccount = this.exampleAccounts.alice
    this.existingAccount2 = this.exampleAccounts.bob
    this.traderAccount = this.exampleAccounts.trader
    this.disabledAccount = this.exampleAccounts.disabledAccount
    this.infiniteMinBalance = this.exampleAccounts.infiniteMinBalance
    this.finiteMinBalance = this.exampleAccounts.finiteMinBalance
    this.unspecifiedMinBalance = this.exampleAccounts.unspecifiedMinBalance
    this.noBalance = this.exampleAccounts.noBalance

    this.transfer = _.cloneDeep(require('./data/transfers/simple'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/simpleWithExpiry'))

    // Store some example data
    await dbHelper.addAccounts([
      this.adminAccount,
      this.existingAccount,
      this.existingAccount2,
      this.traderAccount,
      this.disabledAccount
    ])
  })

  describe('GET /accounts', function () {
    it('should return 200', async function () {
      const account1 = this.adminAccount
      const account3 = this.existingAccount
      const account4 = this.existingAccount2
      const account5 = this.traderAccount
      const account6 = this.disabledAccount
      // Passwords are not returned
      delete account1.password
      delete account3.password
      delete account4.password
      delete account5.password
      delete account6.password
      await this.request()
        .get('/accounts')
        .auth('admin', 'admin')
        .expect((res) => {
          const sortedResponse = _.sortBy(res.body, (account) => {
            return account.name
          })
          const sortedAccounts = _.sortBy([account1, account3, account4, account5, account6], (account) => {
            return account.name
          })
          expect(sortedResponse).to.deep.equal(sortedAccounts)
        })
        .expect(validator.validateAccounts)
        .expect(200)
    })

    it('should return 401/403 if the user isn\'t an admin', async function () {
      await this.request()
        .get('/accounts')
        .expect(401)
      await this.request()
        .get('/accounts')
        .auth('alice', 'alice')
        .expect(403)
    })
  })

  describe('GET /accounts/:uuid (unauthenticated)', function () {
    it('should return 200 + partial data', async function () {
      await this.request()
        .get(this.existingAccount.id)
        .expect(200, {
          id: this.existingAccount.id,
          name: this.existingAccount.name,
          ledger: 'http://localhost'
        })
        .expect(validator.validateAccount)
    })

    it('should return 200 + partial data for an account that does not exist', async function () {
      await this.request()
        .get(this.exampleAccounts.candice.id)
        .expect(200, {
          id: this.exampleAccounts.candice.id,
          name: this.exampleAccounts.candice.name,
          ledger: 'http://localhost'
        })
        .expect(validator.validateAccount)
    })

    it('does not query the database', async function () {
      mock('../src/models/db/accounts', './helpers/dbAccountsMock')
      mock.reRequire('../src/models/accounts')
      const accounts = require('../src/models/accounts')
      // throws if getAccount() queries the database
      await accounts.getAccount('alice', undefined)
    })
  })

  describe('GET /accounts/:uuid (authenticated)', async function () {
    it('should return 200 for an account that exists', async function () {
      await this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(validator.validateAccount)
    })

    it('should return 404 when the account does not exist', async function () {
      await this.request()
        .get(this.exampleAccounts.candice.id)
        .auth('admin', 'admin')
        .expect(404)
    })

    it('should return 401 with invalid credentials', async function () {
      await this.request()
        .get(this.existingAccount.id)
        .auth('candice', 'candice')
        .expect(401)
    })

    it('should default the balance to 0', async function () {
      const account = this.noBalance

      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)

      delete account.password
      await this.request()
        .get(account.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, account, {
          balance: '0',
          ledger: 'http://localhost'
        }))
        .expect(validator.validateAccount)
    })

    it('should return partial data for valid but unauthorized credentials', async function () {
      await this.request()
        .get(this.existingAccount2.id)
        .auth('alice', 'alice')
        .expect(200, {
          id: this.existingAccount2.id,
          name: this.existingAccount2.name,
          ledger: 'http://localhost'
        })
        .expect(validator.validateAccount)
    })

    it('should strip out the password field', async function () {
      const account = this.existingAccount
      const accountWithoutPassword = _.clone(account)
      delete accountWithoutPassword.password
      accountWithoutPassword.ledger = 'http://localhost'
      await this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(accountWithoutPassword)
        .expect(validator.validateAccount)
    })

    it('should return the balance as a string', async function () {
      await this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.balance !== 'string') {
            throw new Error('Balance should be a string')
          }
        })
        .expect(validator.validateAccount)
    })

    it('should return the minimum_allowed_balance as a string', async function () {
      await this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.minimum_allowed_balance !== 'string') {
            throw new Error('minimum_allowed_balance should be a string')
          }
        })
        .expect(validator.validateAccount)
    })

    it('should return the disabled field as a boolean for an admin user', async function () {
      await this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.is_disabled !== 'boolean') {
            throw new Error('disabled should be returned as a boolean')
          }
        })
        .expect(validator.validateAccount)
    })

    it('should allow an admin user to view a disabled account', async function () {
      await this.request()
        .get(this.disabledAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(validator.validateAccount)
    })

    it('should return a 401 when a non-admin user tries to view a disabled account', async function () {
      await this.request()
        .get(this.disabledAccount.id)
        .auth('disabled', 'disabled')
        .expect(401)
    })

    it('should return 0 as a minimum_allowed_balance', async function () {
      await dbHelper.addAccounts([this.unspecifiedMinBalance])

      const account = this.unspecifiedMinBalance
      delete account.password
      await this.request()
        .get(account.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, account, {
          minimum_allowed_balance: '0',
          ledger: 'http://localhost'
        }))
        .expect(validator.validateAccount)
    })

    it('should return -infinity as a minimum_allowed_balance', async function () {
      await dbHelper.addAccounts([this.infiniteMinBalance])

      const account = this.infiniteMinBalance
      delete account.password
      await this.request()
        .get(account.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, account, {
          minimum_allowed_balance: '-infinity',
          ledger: 'http://localhost'
        }))
        .expect(validator.validateAccount)
    })

    it('should return -100 as a minimum_allowed_balance', async function () {
      await dbHelper.addAccounts([this.finiteMinBalance])

      const account = this.finiteMinBalance
      delete account.password
      await this.request()
        .get(account.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, account, {
          minimum_allowed_balance: '-100',
          ledger: 'http://localhost'
        }))
        .expect(validator.validateAccount)
    })
  })

  describe('PUT /accounts/:uuid', function () {
    it('should return 201', async function () {
      const account = this.exampleAccounts.candice
      const withoutPassword = _.omit(account, 'password')
      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)
        .expect(withoutPassword)
        .expect(validator.validateAccount)

      // Check balances
      expect(convertToExternal(await getAccount('candice'))).to.deep.equal(withoutPassword)
    })

    it('should return 200 if the account already exists', async function () {
      const account = this.existingAccount

      // Update balance
      account.balance = '90'

      // Passwords are not returned
      delete account.password

      await this.request()
        .put(this.existingAccount.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(200)
        .expect(account)
        .expect(validator.validateAccount)

      // Check balances
      const row = await getAccount('alice')
      expect(row.balance).to.equal(90)
    })

    it('should return a 400 if the account URL does not match the account id in the JSON', async function () {
      const existingAccount = this.existingAccount
      const existingAccountId = existingAccount.id
      existingAccount.id = this.exampleAccounts.candice.id

      delete existingAccount.password

      await this.request()
        .put(existingAccountId)
        .auth('admin', 'admin')
        .send(existingAccount)
        .expect(400)
    })

    it('should return a 400 if the account name in the URL does not match the account name in the JSON', async function () {
      const existingAccount = this.existingAccount
      const newAccount = this.exampleAccounts.candice

      delete existingAccount.password

      await this.request()
        .put(newAccount.id)
        .auth('admin', 'admin')
        .send(existingAccount)
        .expect(400)
    })

    it('should not reset the admin flag when updating an account', async function () {
      const adminAccount = this.adminAccount

      await this.request()
        .put(adminAccount.id)
        .auth('admin', 'admin')
        .send({
          name: adminAccount.name,
          balance: '500'
        })
        .expect(200)

      await this.request()
        .get(adminAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          assert.isTrue(res.body.is_admin)
        })
    })

    it('should default minimum_allowed_balance to 0 when unspecified', async function () {
      const noMinBalanceAccount = this.unspecifiedMinBalance
      delete noMinBalanceAccount.password
      await this.request()
        .put(noMinBalanceAccount.id)
        .auth('admin', 'admin')
        .send(noMinBalanceAccount)
        .expect(201)
        .expect(_.assign({}, noMinBalanceAccount, {
          minimum_allowed_balance: '0'
        }))
        .expect(validator.validateAccount)
    })

    it('should allow "-infinity" as a valid minimum_allowed_balance', async function () {
      const infiniteMinBalanceAccount = this.infiniteMinBalance
      delete infiniteMinBalanceAccount.password
      await this.request()
        .put(infiniteMinBalanceAccount.id)
        .auth('admin', 'admin')
        .send(infiniteMinBalanceAccount)
        .expect(201)
        .expect(infiniteMinBalanceAccount)
        .expect(validator.validateAccount)
    })

    it('should allow the user to specify a minimum_allowed_balance', async function () {
      const finiteMinBalanceAccount = this.finiteMinBalance
      delete finiteMinBalanceAccount.password
      await this.request()
        .put(finiteMinBalanceAccount.id)
        .auth('admin', 'admin')
        .send(finiteMinBalanceAccount)
        .expect(201)
        .expect(finiteMinBalanceAccount)
        .expect(validator.validateAccount)
    })

    it('should allow admin user to disable an account', async function () {
      const uri = 'http://localhost/accounts/abbey'
      const account = {
        name: 'abbey',
        balance: '50',
        password: 'password01'
      }
      const updatedAccount = {
        name: account.name,
        is_disabled: true
      }
      const expected = {
        balance: '50',
        id: 'http://localhost/accounts/abbey',
        is_disabled: true,
        ledger: 'http://localhost',
        minimum_allowed_balance: '0',
        name: 'abbey'
      }
      await this.request()  // create "abbey" account
        .put(uri)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)
      await this.request()  // disable "abbey" account
        .put(uri)
        .auth('admin', 'admin')
        .send(updatedAccount)
        .expect(200)
      await this.request()  // check "abbey" account
        .get(uri)
        .auth('admin', 'admin')
        .expect(expected)
    })

    it('should reject invalid account name -- uppercased in url', async function () {
      const lowerCased = this.exampleAccounts.candice
      const account = _.assign({}, lowerCased, {id: lowerCased.id.toUpperCase()})

      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(400)
    })

    it('should reject invalid account name -- uppercased in body', async function () {
      const lowerCased = this.exampleAccounts.candice
      const account = _.assign({}, lowerCased, {name: lowerCased.name.toUpperCase()})

      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(400)
    })

    it('should reject invaid account name -- uppercased in url, lowercase in body', async function () {
      const lowerCased = this.exampleAccounts.candice
      const account = _.assign({}, lowerCased, {name: lowerCased.name.toUpperCase()})

      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(_.omit(account, 'id'))
        .expect(400)
    })

    it('should return 400 if name and id are omitted in body', async function () {
      const account = this.exampleAccounts.candice

      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(_.omit(account, ['name', 'id']))
        .expect(400)
    })

    it('should allow creating account without password then setting password', async function () {
      const account = this.exampleAccounts.candice

      // create account without password or fingerprint
      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send({name: account.name, balance: '50'})
        .expect(201)

      // now try to set a password for the account
      await this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send({name: account.name, password: 'password'})
        .expect(200)
    })

    it('should not allow user to create themself', async function () {
      const account = this.exampleAccounts.candice

      await this.request()
        .put(account.id)
        .auth(account.name, account.name)
        .send({name: account.name, password: account.name})
        .expect(401)
    })

    it('should not allow user to set their balance', async function () {
      const account = this.exampleAccounts.alice

      await this.request()
        .put(account.id)
        .auth(account.name, account.name)
        .send({name: account.name, balance: '1000000'})
        .expect(403)
    })

    it('should allow user to change their password', async function () {
      const account = this.exampleAccounts.alice

      await this.request()
        .put(account.id)
        .auth(account.name, account.name)
        .send({name: account.name, password: 'newpass'})
        .expect(200)
    })
  })

  describe('PUT /accounts/:uuid with public_key', function () {
    it('should return 201', async function () {
      const account = this.exampleAccounts.eve
      account.public_key = publicKey
      delete account.password
      await this.request()
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

      // Check balances
      const user = (await getAccount('eve'))
      expect(user.public_key).to.equal(publicKey)
    })
  })

  describe('Initializes accounts', function () {
    it('Sets up admin account', function * () {
      const pass = 'admin_pass'
      const expectedAdmin = {
        name: 'admin_user',
        balance: 0,
        minimum_allowed_balance: -Infinity,
        fingerprint: 'admin_fingerprint',
        is_admin: true,
        is_disabled: false
      }

      process.env.LEDGER_ADMIN_USER = expectedAdmin.name
      process.env.LEDGER_ADMIN_PASS = pass
      process.env.LEDGER_ADMIN_TLS_FINGERPRINT = expectedAdmin.fingerprint
      yield seedDB(loadConfig())

      const actualAdmin = _.omitBy(yield getAccount(expectedAdmin.name), _.isNull)

      expect(hashPassword.verifyPassword(pass, Buffer.from(actualAdmin.password_hash, 'base64')))
      delete actualAdmin.password_hash
      expect(actualAdmin).to.deep.equal(expectedAdmin)
    })
  })
})
