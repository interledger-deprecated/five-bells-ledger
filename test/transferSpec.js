/*global describe, it*/
'use strict';
const _ = require('lodash');
const expect = require('chai').expect;
const defer = require('co-defer');
const nock = require('nock');
nock.enableNetConnect(['localhost', '127.0.0.1']);
const app = require('../app');
const db = require('../services/db');
const dbHelper = require('./helpers/db');
const appHelper = require('./helpers/app');
const logHelper = require('@ripple/five-bells-shared/testHelpers/log');
const sinon = require('sinon');

const START_DATE = 1434412800000; // June 16, 2015 00:00:00 GMT

describe('Transfers', function () {
  logHelper();

  beforeEach(function *() {
    appHelper.create(this, app);

    this.clock = sinon.useFakeTimers(START_DATE);

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transferSimple'));
    this.existingTransfer = _.cloneDeep(require('./data/transferNoAuthorization'));
    this.multiCreditTransfer = _.cloneDeep(require('./data/transferMultiCredit'));
    this.multiDebitTransfer = _.cloneDeep(require('./data/transferMultiDebit'));
    this.multiDebitAndCreditTransfer =
      _.cloneDeep(require('./data/transferMultiDebitAndCredit'));
    this.executedTransfer = _.cloneDeep(require('./data/transferExecuted'));
    this.transferWithExpiry = _.cloneDeep(require('./data/transferWithExpiry'));

    // Reset database
    yield dbHelper.reset();

    // Store some example data
    yield db.put(['accounts'], require('./data/accounts'));
    yield db.create(['transfers'], this.existingTransfer);
  });

  afterEach(function *() {
    nock.cleanAll();
    this.clock.restore();
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

    it('should return a rejected transfer if the expiry date has passed', function *() {
      const transfer = this.formatId(this.transferWithExpiry, '/transfers/');
      delete transfer.debits[0].authorization;

      yield this.request()
        .put('/transfers/' + this.transferWithExpiry.id)
        .send(transfer)
        .expect(201)
        .end();

      this.clock.tick(200);

      // We use setImmediate to make sure the request gets called on the next tick
      defer.setImmediate(function*() {
        yield this.request()
          .get('/transfers/' + this.transferWithExpiry.id)
          .expect(200, _.assign({}, transfer, {
            state: 'rejected',
            rejected_at: transfer.expires_at
          }))
          .end();
      });
    });
  });

  describe('PUT /transfers/:uuid', function () {
    it('should return 201', function *() {
      const transfer = this.formatId(this.exampleTransfer, '/transfers/');
      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'executed'}))
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
                {state: 'executed'}))
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
        .expect(_.assign({}, transfer, {state: 'executed'}))
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
        .expect(_.assign({}, transfer, {state: 'executed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.exampleTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {state: 'executed'}))
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
      const transfer = this.formatId(this.executedTransfer, '/transfers/');
      transfer.execution_condition_fulfillment.signature = 'aW52YWxpZA==';

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
        .send(transfer)
        .expect(422)
        .end();
    });

    it('should return a 422 if a transfer is modified after its ' +
      'expiry date', function *() {

      const transfer = this.formatId(this.transferWithExpiry, '/transfers/');

      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.debits[0].authorization;

      yield this.request()
        .put('/transfers/' + this.transferWithExpiry.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();

      this.clock.tick(200);

      yield this.request()
        .put('/transfers/' + this.transferWithExpiry.id)
        .send(transfer)
        .expect(422)
        .expect(function(res) {
          expect(res.body.id).to.equal('ExpiredTransferError');
          expect(res.body.message).to.equal('Cannot modify transfer after expires_at date');
        })
        .end();
    });

    it('should return a 422 if the expires_at field is removed', function *() {

      const transfer = this.formatId(this.transferWithExpiry, '/transfers/');
      delete transfer.debits[0].authorization;

      const transferWithoutExpiry = _.cloneDeep(transfer);
      delete transferWithoutExpiry.expires_at;

      yield this.request()
        .put('/transfers/' + this.transferWithExpiry.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'proposed'}))
        .end();

      this.clock.tick(200);

      yield this.request()
        .put('/transfers/' + this.transferWithExpiry.id)
        .send(transferWithoutExpiry)
        .expect(400)
        .expect(function(res) {
          expect(res.body.id).to.equal('InvalidModificationError');
          expect(res.body.message).to.equal('Transfer may not be modified in this way');
        })
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
          state: 'executed'
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

    it('should update the state from "proposed" to "executed" when authorization is added and ' +
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
        .expect(_.assign({}, transferWithAuthorization, {state: 'executed'}))
        .end();
    });

    it('should update the state from "proposed" to "prepared" when' +
      'authorization is added and an execution condition is present',
      function *() {
      const transfer = this.formatId(this.executedTransfer, '/transfers/');
      delete transfer.execution_condition_fulfillment;

      const transferWithoutAuthorization = _.cloneDeep(transfer);
      delete transferWithoutAuthorization.debits[0].authorization;

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
        .send(transferWithoutAuthorization)
        .expect(201)
        .expect(_.assign({}, transferWithoutAuthorization, {state: 'proposed'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {state: 'prepared'}))
        .end();
    });

    it('should update the state from "prepared" to "executed" ' +
      'when the execution criteria is met',
       function *() {
      const transfer = this.formatId(this.executedTransfer, '/transfers/');
      delete transfer.state;

      const transferWithoutConditionFulfillment = _.cloneDeep(transfer);
      delete transferWithoutConditionFulfillment.execution_condition_fulfillment;

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
        .send(transferWithoutConditionFulfillment)
        .expect(201)
        .expect(_.assign({}, transferWithoutConditionFulfillment, {state: 'prepared'}))
        .end();

      yield this.request()
        .put('/transfers/' + this.executedTransfer.id)
        .send(transfer)
        .expect(200)
        .expect(_.assign({}, transfer, {state: 'executed'}))
        .end();
    });

    it('should handle transfers with multiple credits', function*() {
      const transfer = this.formatId(this.multiCreditTransfer, '/transfers/');

      yield this.request()
        .put('/transfers/' + this.multiCreditTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'executed'}))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiCreditTransfer.credits[0].account)
        .expect(200)
        .expect({
          id: 'http://localhost/accounts/bob',
          name: 'Bob',
          balance: '10'
        })
        .end();

      yield this.request()
        .get('/accounts/' + this.multiCreditTransfer.credits[1].account)
        .expect(200)
        .expect({
          id: 'http://localhost/accounts/dave',
          name: 'Dave',
          balance: '10'
        })
        .end();
    });

    it('should handle transfers with multiple debits', function*() {
      const transfer = this.formatId(this.multiDebitTransfer, '/transfers/');

      yield this.request()
        .put('/transfers/' + this.multiDebitTransfer.id)
        .send(transfer)
        .expect(201)
        .expect(_.assign({}, transfer, {state: 'executed'}))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitTransfer.debits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/alice',
          name: 'Alice',
          balance: '90'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitTransfer.debits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/candice',
          name: 'Candice',
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
        .expect(_.assign({}, transfer, {state: 'executed'}))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.debits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/alice',
          name: 'Alice',
          balance: '50'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.debits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/candice',
          name: 'Candice',
          balance: '30'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.credits[0].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/bob',
          name: 'Bob',
          balance: '30'
        }))
        .end();

      yield this.request()
        .get('/accounts/' + this.multiDebitAndCreditTransfer.credits[1].account)
        .expect(200)
        .expect(_.assign({}, {
          id: 'http://localhost/accounts/dave',
          name: 'Dave',
          balance: '40'
        }))
        .end();
    });
  });
});
