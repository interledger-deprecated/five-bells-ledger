'use strict';

const superagent = require('co-supertest');
const app = require('../app');
const logHelper = require('./helpers/log');

function request() {
  return superagent(app.listen());
}

describe('Health', function () {
  logHelper();

  describe('GET /health', function () {
    it('should return 200', function *() {
      yield request()
        .get('/health')
        .expect(200)
        .end();
    });
  });
});
