/*global describe, it*/
'use strict';
var _ = require('lodash');
var superagent = require('co-supertest');
var expect = require('chai').expect;
var app = require('../app');
var db = require('../services/db');
var dbHelper = require('./helpers/db');

function request() {
  return superagent(app.listen());
}

describe('Health', function () {
  describe('GET /health', function () {
    it('should return 200', function *() {
      yield request()
        .get('/health')
        .expect(200)
        .end();
    });
  });
});
