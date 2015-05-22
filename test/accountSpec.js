/*global describe, it*/
'use strict';
const expect = require('chai').expect;
const app = require('../app');
const db = require('../services/db');
const dbHelper = require('./helpers/db');
const appHelper = require('./helpers/app');
const logHelper = require('@ripple/five-bells-shared/testHelpers/log');

describe('Accounts', function () {
  logHelper();

  beforeEach(function *() {
    appHelper.create(this, app);

    // Define example data
    this.exampleAccounts = require('./data/accounts');
    this.existingAccount = this.exampleAccounts.alice;

    // Reset database
    yield dbHelper.reset();

    // Store some example data
    yield db.create(['accounts'], this.existingAccount);
  });

  describe('GET /accounts', function () {
    it('should return 200', function *() {
      const account = this.formatId(this.existingAccount, '/accounts/');
      yield this.request()
        .get('/accounts')
        .expect(200)
        .expect([account])
        .end();
    });

    it('should return 200 with an empty array if there are no accounts', function *() {
      yield db.remove(['accounts']);
      yield this.request()
        .get('/accounts')
        .expect(200)
        .expect([])
        .end();
    });
  });

  describe('GET /accounts/:uuid', function () {
    it('should return 200', function *() {
      const account = this.formatId(this.existingAccount, '/accounts/');
      yield this.request()
        .get('/accounts/' + this.existingAccount.id)
        .expect(200)
        .expect(account)
        .end();
    });

    it('should return 404 when the transfer does not exist', function *() {
      yield this.request()
        .get('/accounts/' + this.exampleAccounts.bob.id)
        .expect(404)
        .end();
    });
  });

  describe('PUT /accounts/:uuid', function () {
    it('should return 201', function *() {
      const account = this.formatId(this.exampleAccounts.bob, '/accounts/');
      yield this.request()
        .put('/accounts/' + this.exampleAccounts.bob.id)
        .send(account)
        .expect(201)
        .expect(account)
        .end();

      // Check balances
      expect(yield db.get(['accounts', 'bob'])).to.deep.equal(this.exampleAccounts.bob);
    });

    it('should return 200 if the account already exists', function *() {
      const account = this.formatId(this.existingAccount, '/accounts/');
      account.balance = '90';
      yield this.request()
        .put('/accounts/' + this.existingAccount.id)
        .send(account)
        .expect(200)
        .expect(account)
        .end();

      // Check balances
      expect(yield db.get(['accounts', 'alice', 'balance'])).to.equal('90');
    });
  });
});
