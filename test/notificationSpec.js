'use strict'

const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const sinon = require('sinon')
const app = require('../src/services/app')
const logger = require('../src/services/log')
const appHelper = require('./helpers/app')
const dbHelper = require('./helpers/db')
const logHelper = require('five-bells-shared/testHelpers/log')
const validator = require('./helpers/validator')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Notifications', function () {
  logHelper(logger)

  beforeEach(function *() {
    appHelper.create(this, app)

    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.existingSubscription = _.cloneDeep(require('./data/subscription1'))
    this.exampleSubscription = _.cloneDeep(require('./data/subscription2'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry'))
    this.existingNotification = _.cloneDeep(require('./data/notificationDatabaseEntry'))
    this.notificationResponse = _.cloneDeep(require('./data/notificationResponse'))

    const idParts = this.exampleTransfer.id.split('/')
    this.existingFulfillment = {
      transfer_id: idParts[idParts.length - 1],
      condition_fulfillment: _.cloneDeep(require('./data/fulfillments/execution'))
    }

    // Reset database
    yield dbHelper.reset()

    // Use fake time
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Store some example data
    yield dbHelper.addAccounts(_.values(require('./data/accounts')))
    yield dbHelper.addTransfers([this.exampleTransfer])
    yield dbHelper.addSubscriptions([this.existingSubscription])
    yield dbHelper.addNotifications([this.existingNotification])
    yield dbHelper.addFulfillments([this.existingFulfillment])
  })

  describe('GET /subscriptions/:subscription_id/notifications/:notification_id', function () {
    it('should return 200', function *() {
      yield this.request()
        .get(this.existingSubscription.id + '/notifications/' + this.existingNotification.id)
        .auth('alice', 'alice')
        .expect(200)
        .expect(this.notificationResponse)
        .expect(validator.validateNotification)
        .end()
    })

    it('should return 404 for a non-existent subscription id', function *() {
      yield this.request()
        .get(this.exampleSubscription.id + '/notifications/' + this.existingNotification.id)
        .auth('bob', 'bob')
        .expect(404)
        .end()
    })

    it('should return 404 for a non-existent notification id', function *() {
      yield this.request()
        .get(this.existingSubscription.id + '/notifications/ad78bd3c-68ce-488a-9dba-acd99cbff637')
        .auth('bob', 'bob')
        .expect(404)
        .end()
    })

    it('should return 403 for a notification from a subscription the user doesn\'t own', function *() {
      yield this.request()
        .get(this.existingSubscription.id + '/notifications/' + this.existingNotification.id)
        .auth('bob', 'bob')
        .expect(403)
        .end()
    })

    it('should allow an admin to view any notification', function *() {
      yield this.request()
        .get(this.existingSubscription.id + '/notifications/' + this.existingNotification.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(this.notificationResponse)
        .expect(validator.validateNotification)
        .end()
    })
  })
})
