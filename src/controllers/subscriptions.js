'use strict'

const uuid = require('uuid4')
const db = require('../services/db')
const log = require('../services/log')('subscriptions')
const request = require('@ripple/five-bells-shared/utils/request')
const NotFoundError = require('@ripple/five-bells-shared/errors/not-found-error')
const Account = require('../models/account').Account
const Subscription = require('../models/subscription').Subscription

/**
 * Validate a subscription semantically.
 *
 * We use schemas to validate data syntactically, this method takes care of all
 * remaining validations.
 *
 * @param {Object} subscription Subscription
 * @param {Object} tr Database transaction
 * @returns {void}
 */
function * validateSubscriptionSemantics (subscription, transaction) {
  const owner = yield Account.findById(subscription.owner, { transaction })

  if (typeof owner === 'undefined') {
    // TODO Add authentication and reenable this check
    // throw new UnprocessableEntityError('Owner does not exist.')
  }
}

/**
 * Store a subscription in the database.
 *
 * @param {Object} subscription Subscription
 * @returns {void}
 */
function * storeSubscription (subscription) {
  yield db.transaction(function *(transaction) {
    // Check prerequisites
    yield * validateSubscriptionSemantics(subscription, transaction)

    // Store subscription in database
    // TODO: Who to subscribe to should be defined by a separate `subject`
    //       field.
    Subscription.upsert(subscription, { transaction })
  })
}

/**
 * @api {get} /subscriptions/:id Get RESThook subscription
 * @apiName GetSubscription
 * @apiGroup Subscription
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details or status of a
 *   subscription.
 *
 * @apiParam {String} id Subscription
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 *
 * @returns {void}
 */
exports.getResource = function * fetch () {
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  log.debug('fetching subscription ID ' + id)

  const subscription = yield Subscription.findById(id)
  if (subscription) {
    this.body = subscription.toJSONExternal()
  } else {
    throw new NotFoundError('Unknown subscription ID')
  }
}

/**
 * @api {post} /subscriptions Subscribe to an event
 * @apiName PostSubscription
 * @apiGroup Subscription
 * @apiVersion 1.0.0
 *
 * @apiParamExample {json} Request Body Example
 *     {
 *       "id": "f49697a6-d52c-4f46-84c8-9070a31feab7",
 *       "owner": "alice",
 *       "event": "transfer.create",
 *       "target": "http://192.0.2.1/test"
 *     }
 *
 * @apiUse InvalidBodyError
 *
 * @returns {void}
 */
exports.postResource = function * create () {
  const subscription = this.body

  // Generate a unique subscription ID outside of the transaction block
  if (!subscription.id) {
    subscription.id = uuid()
  }
  log.debug('preparing subscription ID ' + subscription.id)

  // Validate and store subscription in database
  yield * storeSubscription(subscription)

  log.debug('subscription created')

  this.body = Subscription.build(subscription).toJSONExternal()
  this.status = 201
}

exports.putResource = function * update () {
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  const subscription = this.body

  if (typeof subscription.id !== 'undefined') {
    request.assert.strictEqual(subscription.id, id,
      'Subscription ID must match the one in the URL')
  } else {
    subscription.id = id
  }

  log.debug('updating subscription ID ' + subscription.id)
  log.debug('subscribed ' + subscription.owner + ' at ' + subscription.target)

  // Validate and store subscription in database
  yield * storeSubscription(subscription)

  log.debug('update completed')

  this.body = Subscription.build(subscription).toJSONExternal()
}

/**
 * @api {delete} /subscriptions/:id Cancel a subscription
 * @apiName DeleteSubscription
 * @apiGroup Subscription
 * @apiVersion 1.0.0
 *
 * @apiDescription End a subscription.
 *
 * @apiParam {String} id Subscription
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 *
 * @returns {void}
 */
exports.deleteResource = function * remove () {
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()

  log.debug('deleting subscription ID ' + id)

  yield db.transaction(function *(transaction) {
    const subscription = yield Subscription.findById(id, { transaction })

    if (!subscription) {
      throw new NotFoundError('Unknown subscription ID')
    }

    subscription.destroy({ transaction })
  })

  this.status = 204
}
