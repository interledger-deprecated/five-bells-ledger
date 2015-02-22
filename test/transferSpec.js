/*global describe, it*/
'use strict';
var superagent = require('supertest-promised');
var uuid = require('node-uuid');
var expect = require('chai').expect;
var app = require('../app');
var db = require('../services/db');
var dbHelper = require('./helpers/db');

function request() {
  return superagent(app.listen());
}

describe('Transfers', function () {
  beforeEach(function *() {
    // Define example data
    this.exampleTransfer = require('./data/transfer1');
    this.existingTransfer = require('./data/transfer2');

    // Reset database
    yield dbHelper.reset();

    // Store some example data
    yield db.put(['people'], require('./data/people'));
    yield db.create(['transfers'], this.existingTransfer);
  });

  describe('GET /transfers/:uuid', function () {
    it('should return 200', function *() {
      yield request()
        .get('/transfers/'+this.existingTransfer.id)
        .expect(200)
        .expect(this.existingTransfer)
        .end();
    });
  });

  describe('PUT /transfers/:uuid', function () {
    it('should return 201', function *() {
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(201)
        .expect(this.exampleTransfer)
        .end();

      // Check balances
      expect(yield db.get(['people', 'alice', 'balance'])).to.equal(90);
      expect(yield db.get(['people', 'bob', 'balance'])).to.equal(10);
    });

    it('should trigger subscriptions', function *() {
      var subscription = require('./data/subscription1.json');
      yield db.create(['people', subscription.owner, 'subscriptions', subscription.id], subscription);
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(201)
        .expect(this.exampleTransfer)
        .end();

      // TODO: Expect subscription to trigger
    });

    it('should return 409 if the transfer already exists', function *() {
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(201)
        .expect(this.exampleTransfer)
        .end();

      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(409)
        .end();
    });

    it('should return 422 if the amount is zero', function *() {
      this.exampleTransfer.source.amount = "0";
      this.exampleTransfer.destination.amount = "0";
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t have enough money', function *() {
      this.exampleTransfer.source.amount = "101";
      this.exampleTransfer.destination.amount = "101";
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t exist', function *() {
      this.exampleTransfer.source.owner = "alois";
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the recipient doesn\'t exist', function *() {
      this.exampleTransfer.destination.owner = "blob";
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if source and destination amounts don\'t match', function *() {
      this.exampleTransfer.destination.owner = "blob";
      yield request()
        .put('/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 403 if the request is unauthorized');
    it('should return 403 if the authorization is forged');
    it('should return 403 if the authorization is not applicable');
  });
});
