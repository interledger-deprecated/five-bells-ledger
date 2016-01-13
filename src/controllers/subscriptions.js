'use strict'

const db = require('../services/db')
const log = require('../services/log')('subscriptions')
const uri = require('../services/uriManager')
const request = require('five-bells-shared/utils/request')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const Subscription = require('../models/subscription').Subscription

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
 * @apiUse UnauthorizedError
 *
 * @returns {void}
 */
exports.getResource = function * fetch () {
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  log.debug('fetching subscription ID ' + id)

  const requestOwner = uri.make('account', this.req.user.name)
  const subscription = yield Subscription.findById(id)
  if (!subscription) {
    throw new NotFoundError('Unknown subscription ID')
  } else if (!(requestOwner === subscription.owner || this.req.user.is_admin)) {
    throw new UnauthorizedError('You may only view subscriptions you own')
  } else {
    this.body = subscription.getDataExternal()
  }
}

/**
 * @api {put} /subscriptions Subscribe to an event
 * @apiName PutSubscription
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
 * @apiUse UnauthorizedError
 *
 * @returns {void}
 */

exports.putResource = function * update () {
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  const subscription = this.body

  const requestOwner = uri.make('account', this.req.user.name)
  if (requestOwner !== subscription.owner) {
    throw new UnauthorizedError('You do not own this account')
  }

  if (typeof subscription.id !== 'undefined') {
    request.assert.strictEqual(subscription.id, id,
      'Subscription ID must match the one in the URL')
  } else {
    subscription.id = id
  }

  log.debug('updating subscription ID ' + subscription.id)
  log.debug('subscribed ' + subscription.owner + ' at ' + subscription.target)

  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  let existed
  yield db.transaction(function * (transaction) {
    existed = yield Subscription.findById(id, { transaction })
    yield Subscription.upsert(subscription, { transaction })
  })

  log.debug('update completed')

  this.body = subscription.getDataExternal()
  this.status = existed ? 200 : 201
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
 * @apiUse UnauthorizedError
 *
 * @returns {void}
 */
exports.deleteResource = function * remove () {
  const self = this
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()

  log.debug('deleting subscription ID ' + id)

  yield db.transaction(function *(transaction) {
    const subscription = yield Subscription.findById(id, { transaction })

    if (!subscription) {
      throw new NotFoundError('Unknown subscription ID')
    }
    const requestOwner = uri.make('account', self.req.user.name)
    if (!(requestOwner === subscription.owner || self.req.user.is_admin)) {
      throw new UnauthorizedError('You don\'t have permission to delete this subscription')
    }

    subscription.destroy({ transaction })
  })

  this.status = 204
}
