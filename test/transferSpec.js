/*global describe, it*/
'use strict';
var superagent = require('supertest-promised');
var uuid = require('node-uuid');
var expect = require('chai').expect;
var app = require('../app');
var db = require('../services/db');

function request() {
  return superagent(app.listen());
}

describe('Transfers', function () {
  beforeEach(function () {
    var _this = this;

    // Create some example data
    this.exampleTransfer = {
      id: uuid.v4(),
      source: {
        owner: 'alice',
        amount: '10'
      },
      destination: {
        owner: 'bob',
        amount: '10'
      }
    };

    this.existingTransfer = {
      id: uuid.v4(),
      source: {
        owner: 'alice',
        amount: '10'
      },
      destination: {
        owner: 'bob',
        amount: '10'
      }
    };

    // Reset database
    return db.transaction(function *(tr) {
      yield tr.remove(['holds']);
      yield tr.remove(['transfers']);
      yield tr.remove(['people']);
      tr.create(['people'], {
        id: 'alice',
        balance: 100
      });
      tr.create(['people'], {
        id: 'bob',
        balance: 0
      });
      tr.create(['transfers'], _this.existingTransfer);
    });
  });

  describe('GET /v1/transfers/:uuid', function () {
    it('should return 200', function *() {
      yield request()
        .get('/v1/transfers/'+this.existingTransfer.id)
        .expect(200)
        .expect(this.existingTransfer)
        .end();
    });
  });

  describe('PUT /v1/transfers/:uuid', function () {
    it('should return 201', function *() {
      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(201)
        .expect(this.exampleTransfer)
        .end();

      // Check balances
      expect(yield db.get(['people', 'alice', 'balance'])).to.equal(90);
      expect(yield db.get(['people', 'bob', 'balance'])).to.equal(10);
    });

    it('should return 409 if the transfer already exists', function *() {
      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(201)
        .expect(this.exampleTransfer)
        .end();

      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(409)
        .end();
    });

    it('should return 422 if the amount is zero', function *() {
      this.exampleTransfer.source.amount = "0";
      this.exampleTransfer.destination.amount = "0";
      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t have enough money', function *() {
      this.exampleTransfer.source.amount = "101";
      this.exampleTransfer.destination.amount = "101";
      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the sender doesn\'t exist', function *() {
      this.exampleTransfer.source.owner = "alois";
      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if the recipient doesn\'t exist', function *() {
      this.exampleTransfer.destination.owner = "blob";
      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 422 if source and destination amounts don\'t match', function *() {
      this.exampleTransfer.destination.owner = "blob";
      yield request()
        .put('/v1/transfers/'+this.exampleTransfer.id)
        .send(this.exampleTransfer)
        .expect(422)
        .end();
    });

    it('should return 403 if the request is unauthorized');
    it('should return 403 if the authorization is forged');
    it('should return 403 if the authorization is not applicable');
  });
});
