'use strict'

const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const expect = require('chai').expect
const sinon = require('sinon')
const app = require('../src/services/app')
const logger = require('../src/services/log')
const appHelper = require('./helpers/app')
const dbHelper = require('./helpers/db')
const getSubscription = require('../src/models/db/subscriptions')
  .getSubscription
const uri = require('../src/services/uriManager')
const logHelper = require('five-bells-shared/testHelpers/log')
const transferExpiryMonitor = require('../src/services/transferExpiryMonitor')
const notificationWorker = require('../src/services/notificationWorker')
const validator = require('./helpers/validator')
const convertToExternalSubscription =
  require('../src/models/converters/subscriptions')
    .convertToExternalSubscription

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Subscriptions', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()
    // Define example data
    this.exampleTransfer = _.cloneDeep(require('./data/transfers/simple'))
    this.exampleSubscription = _.cloneDeep(require('./data/subscriptions/alice'))
    this.existingSubscription = _.cloneDeep(require('./data/subscriptions/bob'))
    this.deletedSubscription = _.cloneDeep(require('./data/subscriptions/deleted'))
    this.transferWithExpiry = _.cloneDeep(require('./data/transfers/withExpiry'))

    // Use fake time
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Store some example data
    yield dbHelper.addAccounts(_.values(require('./data/accounts')))
    yield dbHelper.addSubscriptions([_.assign({}, this.existingSubscription, {is_deleted: false}), this.deletedSubscription])
  })

  describe('GET /subscriptions/:uuid', function () {
    it('should return 200', function * () {
      yield this.request()
        .get(this.existingSubscription.id)
        .auth('bob', 'bob')
        .expect(200)
        .expect(this.existingSubscription)
        .expect(validator.validateSubscription)
        .end()
    })

    it('should return 404 for a non-existent subscription', function * () {
      yield this.request()
        .get(this.exampleSubscription.id)
        .auth('bob', 'bob')
        .expect(404)
        .end()
    })

    it('should return 404 for a deleted subscription', function * () {
      yield this.request()
        .get(this.deletedSubscription.id)
        .auth('admin', 'admin')
        .expect(404)
        .end()
    })

    it('should return 403 for a subscription the user doesn\'t own', function * () {
      yield this.request()
        .get(this.existingSubscription.id)
        .auth('alice', 'alice')
        .expect(403)
        .end()
    })

    it('should allow an admin to view any subscription', function * () {
      yield this.request()
        .get(this.existingSubscription.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(this.existingSubscription)
        .expect(validator.validateSubscription)
        .end()
    })
  })

  describe('PUT /subscriptions', function () {
    it('should return 201', function * () {
      const id = uri.parse(this.exampleSubscription.id, 'subscription').id
      yield this.request()
        .put(this.exampleSubscription.id)
        .send(this.exampleSubscription)
        .auth('alice', 'alice')
        .expect(201)
        .expect(this.exampleSubscription)
        .expect(validator.validateSubscription)
        .end()

      // Check that the subscription landed in the database
      expect(convertToExternalSubscription(yield getSubscription(id)))
        .to.deep.equal(this.exampleSubscription)
    })

    it('should return 200 when updating the target URL', function * () {
      this.existingSubscription.target = 'http://subscriber2.example/hooks'
      yield this.request()
        .put(this.existingSubscription.id)
        .send(this.existingSubscription)
        .auth('bob', 'bob')
        .expect(200)
        .expect(this.existingSubscription)
        .expect(validator.validateSubscription)
        .end()

      // Check that the subscription url is changed in the database
      const id = uri.parse(this.existingSubscription.id, 'subscription').id
      expect(convertToExternalSubscription(yield getSubscription(id)))
        .to.deep.equal(this.existingSubscription)
    })

    it('should return 400 when updating a deleted subscription', function * () {
      yield this.request()
        .delete(this.existingSubscription.id)
        .auth('bob', 'bob')
        .expect(204)
        .end()

      this.existingSubscription.target = 'http://subscriber2.example/hooks'
      yield this.request()
        .put(this.existingSubscription.id)
        .send(this.existingSubscription)
        .auth('bob', 'bob')
        .expect(400)
        .end()
    })

    it('should return 400 when putting a deleted subscription', function * () {
      yield this.request()
        .delete(this.existingSubscription.id)
        .auth('bob', 'bob')
        .expect(204)
        .end()

      yield this.request()
        .put(this.existingSubscription.id)
        .send(this.existingSubscription)
        .auth('bob', 'bob')
        .expect(400)
        .end()
    })

    it('should return a 422 when the event/target/subject matches an existing subscription', function * () {
      yield this.request()
        .put(this.existingSubscription.id)
        .send(this.existingSubscription)
        .auth('bob', 'bob')
        .expect(422)
        .end()
    })

    it('should return 403 for an account the user does not own', function * () {
      yield this.request()
        .put(this.exampleSubscription.id)
        .send(this.exampleSubscription)
        .auth('bob', 'bob')
        .expect(403)
        .end()
    })

    it('should return 403 if the user doesn\'t own the subject account', function * () {
      this.exampleSubscription.subject = this.existingSubscription.subject
      yield this.request()
        .put(this.exampleSubscription.id)
        .send(this.exampleSubscription)
        .auth('alice', 'alice')
        .expect(403)
        .end()
    })

    it('should return 201 when an admin subscribes to any subject account', function * () {
      this.exampleSubscription.owner = 'http://localhost/accounts/admin'
      /* The subject is Alices's account */
      yield this.request()
        .put(this.exampleSubscription.id)
        .send(this.exampleSubscription)
        .auth('admin', 'admin')
        .expect(201)
        .expect(validator.validateSubscription)
        .end()
    })
  })

  describe('DELETE /subscriptions/:uuid', function () {
    it('should return 204', function * () {
      yield this.request()
        .delete(this.existingSubscription.id)
        .auth('bob', 'bob')
        .expect(204)
        .end()

      // Ensure subscription is no longer returned
      yield this.request()
        .get(this.existingSubscription.id)
        .auth('bob', 'bob')
        .expect(404)
        .end()
    })

    it('should return 403 if the user tries to delete a subscription they don\'t own', function * () {
      yield this.request()
        .delete(this.existingSubscription.id)
        .auth('alice', 'alice')
        .expect(403)
        .end()
    })

    it('should return 204 when an admin deletes any subscription', function * () {
      yield this.request()
        .delete(this.existingSubscription.id)
        .auth('admin', 'admin')
        .expect(204)
        .end()
    })

    it('should not insert a db record if the subscription does not exist', function * () {
      const nonExistentSubscriptionId = '8c314fbe-8e07-4735-9cc7-3aea8a08193b'
      yield this.request()
        .delete('http://localhost/subscriptions/' + nonExistentSubscriptionId)
        .auth('admin', 'admin')
        .expect(404)
        .end()

      expect(yield getSubscription(nonExistentSubscriptionId)).to.be.null
    })
  })

  // TODO put all tests related to expiring transfers in one file
  describe('Expired Transfer Notification', function () {
    it('should notify subscribers for expired transfers', function * () {
      const subscriberNock = nock('http://subscriber.example')
        .post('/notifications')
        .times(2) // once for original submission, once on expiry
        .reply(204)

      const transfer = this.transferWithExpiry
      delete transfer.debits[0].authorized
      delete transfer.debits[1].authorized

      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()
      yield notificationWorker.processNotificationQueue()
      this.clock.tick(1000)

      // In production this function should be triggered by the workers started in app.js
      yield transferExpiryMonitor.processExpiredTransfers()
      yield notificationWorker.processNotificationQueue()

      // Make sure we were notified
      subscriberNock.done()
    })
  })

  describe('Retry failed notifications', function () {
    it('re-posts the notification until success', function * () {
      const subscriberNock1 = nock('http://subscriber.example')
        .post('/notifications')
        .reply(400) // fail the first time
      const subscriberNock2 = nock('http://subscriber.example')
        .post('/notifications')
        .reply(204)

      const transfer = this.exampleTransfer
      delete transfer.debits[0].authorized
      yield this.request()
        .put(transfer.id)
        .auth('alice', 'alice')
        .send(transfer)
        .expect(201)
        .expect(validator.validateTransfer)
        .end()
      yield notificationWorker.processNotificationQueue()
      subscriberNock1.done()

      this.clock.tick(500)
      // This doesn't notify because we are still waiting another 1.5 seconds for the retry.
      yield notificationWorker.processNotificationQueue()
      expect(subscriberNock2.isDone()).to.equal(false)

      // MySQL uses second precision so we add 1000ms to account for
      // rounding.
      this.clock.tick(2500)
      yield notificationWorker.processNotificationQueue()

      // Make sure we were notified
      subscriberNock2.done()
    })
  })
})
