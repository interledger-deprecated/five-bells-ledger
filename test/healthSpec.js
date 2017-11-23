'use strict'

const superagent = require('supertest')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const app = require('../src/services/app')
const dbHelper = require('./helpers/db')
const accounts = require('./data/accounts')
const logger = require('../src/services/log')
const logHelper = require('./helpers/log')
const expect = require('chai').expect

describe('Health', function () {
  logHelper(logger)

  before(async function () {
    await dbHelper.init()
    await dbHelper.clean()
    await dbHelper.addAccounts([
      accounts.admin
    ])

    this.server = app.koa.listen()
    this.request = () => superagent(this.server)
  })

  after(function () {
    this.server.close()
  })

  describe('GET /health', function () {
    it('should return 200 for an authenticated request', async function () {
      await this.request()
        .get('/health')
        .auth('admin', 'admin')
        .expect(200)
        .expect((res) => {
          expect(res.body).to.deep.equal({
            status: 'OK'
          })
        })
    })

    it('should return 401 for an unauthenticated request', async function () {
      await this.request()
        .get('/health')
        .expect(401)
    })
  })
})
