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

describe('Holds', function () {
  beforeEach(function *() {
    // Define example data
    this.exampleHold = require('./data/hold1');
    this.existingHold = require('./data/hold2');

    // Reset database
    yield dbHelper.reset();

    // Store some example data
    yield db.put(['people'], require('./data/people'));
    yield db.create(['holds'], this.existingHold);
  });

  describe('GET /holds/:uuid', function () {
    it('should return 200', function *() {
      yield request()
        .get('/holds/'+this.existingHold.id)
        .expect(200)
        .expect(this.existingHold)
        .end();
    });
  });

  describe('PUT /holds/:uuid', function () {
    it('should return 201', function *() {
      yield request()
        .put('/holds/'+this.exampleHold.id)
        .send(this.exampleHold)
        .expect(201)
        .expect(this.exampleHold)
        .end();

      // Check balances
      expect(yield db.get(['people', 'alice', 'balance'])).to.equal(90);
    });

    it('should trigger subscriptions', function *() {
      var subscription = require('./data/subscription1.json');
      yield db.create(['people', subscription.owner, 'subscriptions', subscription.id], subscription);
      yield request()
        .put('/holds/'+this.exampleHold.id)
        .send(this.exampleHold)
        .expect(201)
        // .expect(this.exampleHold)
        .end();

      // TODO: Expect subscription to trigger
    });

    it('should return 409 if the hold already exists', function *() {
      yield request()
        .put('/holds/'+this.exampleHold.id)
        .send(this.exampleHold)
        .expect(201)
        .expect(this.exampleHold)
        .end();

      yield request()
        .put('/holds/'+this.exampleHold.id)
        .send(this.exampleHold)
        .expect(409)
        .end();
    });

    it('should return 422 if the amount is zero', function *() {
      this.exampleHold.source.amount = "0";
      yield request()
        .put('/holds/'+this.exampleHold.id)
        .send(this.exampleHold)
        .expect(422)
        .end();
    });

    it('should return 422 if the owner doesn\'t have enough money', function *() {
      this.exampleHold.source.amount = "101";
      yield request()
        .put('/holds/'+this.exampleHold.id)
        .send(this.exampleHold)
        .expect(422)
        .end();
    });

    it('should return 422 if the owner doesn\'t exist', function *() {
      this.exampleHold.source.owner = "alois";
      yield request()
        .put('/holds/'+this.exampleHold.id)
        .send(this.exampleHold)
        .expect(422)
        .end();
    });

    it('should return 403 if the request is unauthorized');
    it('should return 403 if the authorization is forged');
    it('should return 403 if the authorization is not applicable');
  });
});
