/*global describe, it*/
'use strict';
const _ = require('lodash');
const expect = require('chai').expect;
const nock = require('nock');
nock.enableNetConnect(['localhost', '127.0.0.1']);
const app = require('../app');
const db = require('../services/db');
const dbHelper = require('./helpers/db');
const appHelper = require('./helpers/app');
const logHelper = require('five-bells-shared/testHelpers/log');
const tweetnacl = require('tweetnacl');

describe('Transfers', function () {
  logHelper();

  beforeEach(function *() {
    appHelper.create(this, app);

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transfer1'));
    this.existingTransfer = _.cloneDeep(require('./data/transfer2'));
    this.multiCreditTransfer = _.cloneDeep(require('./data/transfer3'));
    this.multiDebitTransfer = _.cloneDeep(require('./data/transfer4'));
    this.multiDebitAndCreditTransfer = _.cloneDeep(require('./data/transfer5'));
    this.completedTransfer = _.cloneDeep(require('./data/transfer_completed'));

    // Reset database
    yield dbHelper.reset();

    // Store some example data
    yield db.put(['accounts'], require('./data/accounts'));
    yield db.create(['transfers'], this.existingTransfer);
  });

  afterEach(function *() {
    nock.cleanAll();
  });

  describe('GET /transfers/:uuid', function () {
    it('should return 200', function *() {
      const transfer = this.formatId(this.existingTransfer, '/transfers/');
      yield this.request()
        .get('/transfers/' + this.existingTransfer.id)
        .expect(200)
        .expect(transfer)
        .end();
    });

    it('should return 404 when the transfer does not exist', function *() {
      yield this.request()
        .get('/transfers/' + this.exampleTransfer.id)
        .expect(404)
        .end();
    });
  });

  describe('PUT /transfers/:uuid', function () {
    it('should return 201', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      // Check balances
      expect(yield db.get(['accounts', 'alice', 'balance'])).to.equal(90);
      expect(yield db.get(['accounts', 'bob', 'balance'])).to.equal(10);
    });

    it('should return 201 if the transfer does not have an ID set', function *() {
      const transferWithoutId = _.cloneDeep(this.exampleTransfer);
      delete transferWithoutId.id;
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutId)
        .expect(201)
        .expect(_.assign({}, this.formatId(this.exampleTransfer, '/transfers/'),
                {state: 'completed'}))
        .end();

      // Check balances
      expect(yield db.get(['accounts', 'alice', 'balance'])).to.equal(90);
      expect(yield db.get(['accounts', 'bob', 'balance'])).to.equal(10);
    });

    it('should trigger subscriptions', function *() {
      const subscription = require('./data/subscription1.json');
      yield db.create(['subscriptions'], subscription);

      const notification = nock('http://subscriber.example')
        .post('/notifications')
        .reply(204);

      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      notification.done();
    });

    it('should return 400 if the transfer ID is invalid', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      delete transfer.id;
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id + 'bogus')
        .send(transfer)
        .expect(400)
        .end();
    });

    it('should return 400 if the transfer is invalid', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.debits[0].amount = 'bogus';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(400)
        .end();
    });

    it('should return 200 if the transfer already exists', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();
    });

    it('should return 422 if the source amount is zero', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.debits[0].amount = '0';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the destination amount is zero', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.credits[0].amount = '0';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t have enough money', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.debits[0].amount = '101';
      transfer.credits[0].amount = '101';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t exist', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.debits[0].account = 'alois';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the recipient doesn\'t exist', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.credits[0].account = 'blob';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if source and destination amounts don\'t match', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.credits[0].amount = '122';
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the signature is invalid', function *() {
      const transfer = this.formatId(this.completedTransfer, '/transfers/');
      transfer.execution_condition_fulfillment.signature = 'aW52YWxpZA==';

      yield this.request()
        .put('/transfers/' + this.completedTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return 403 if the request is unauthorized');
    it('should return 403 if the authorization is forged');
    it('should return 403 if the authorization is not applicable');

    it('should accept a transfer with an upper case ID but convert the ID' +
      'to lower case', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      transfer.id = transfer.id.toUpperCase();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {
          id: transfer.id.toLowerCase(),
          state: 'completed'
        }))
        .end();
    });

    it('should set the transfer state to "proposed" if no authorization is given', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.debits[0].authorization;

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();
    });

    it('should update the state from "proposed" to "completed" when authorization is added and ' +
       'no execution condition is given', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');

      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.debits[0].authorization;

      const transferWithAuthorization = _.cloneDeep(transfer);

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transferWithAuthorization)
        .expect(200)
        .expect(_.assign({}, transferWithAuthorization, {state: 'completed'}))
        .end();
    });

    it('should update the state from "proposed" to "prepared" when' +
      'authorization is added and an execution condition is present',
      function *() {
      const transfer = this.formatId(this.completedTransfer, '/transfers/');
      delete transfer.execution_condition_fulfillment;

      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.debits[0].authorization;

      yield this.request()
        .put('/transfers/' + this.completedTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.completedTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {state: 'prepared'}))
        .end();
    });

    it('should update the state from "prepared" to "completed" ' +
      'when the execution criteria is met',
       function *() {
      const transfer = this.formatId(this.completedTransfer, '/transfers/');
      delete transfer.state;

      const transferWithoutConditionFulfillment = _.cloneDeep(transfer);
      delete transferWithoutConditionFulfillment.execution_condition_fulfillment;

      yield this.request()
        .put('/transfers/' + this.completedTransfer.id)
        .send(transferWithoutConditionFulfillment)
        .expect(201)
        .expect(_.assign({}, transferWithoutConditionFulfillment, {state: 'prepared'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.completedTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();
    });

    it('should handle transfers with multiple credits', function*() {
      const transfer = this.formatId(this.multiCreditTransfer, '/transfers/');

      yield this.request()
        .put('/transfers/' + this.multiCreditTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiCreditTransfer.credits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'bob',
          balance: '10'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiCreditTransfer.credits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'dave',
          balance: '10'
        }))
        .end();
    });

    it('should handle transfers with multiple debits', function*() {
      const transfer = this.formatId(this.multiDebitTransfer, '/transfers/');

      yield this.request()
        .put('/transfers/' + this.multiDebitTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitTransfer.debits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'alice',
          balance: '90'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitTransfer.debits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'candice',
          balance: '40'
        }))
        .end();
    });

    it('should handle transfers with multiple debits and multiple credits',
      function*() {
      const transfer = this.formatId(this.multiDebitAndCreditTransfer, '/transfers/');

      yield this.request()
        .put('/transfers/' + this.multiDebitAndCreditTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'completed'}))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.debits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'alice',
          balance: '50'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.debits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'candice',
          balance: '30'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.credits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'bob',
          balance: '30'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.credits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'dave',
          balance: '40'
        }))
        .end();
    });
  });
});
