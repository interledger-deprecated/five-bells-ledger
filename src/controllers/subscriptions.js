'use strict'

const db = require('../services/db')
const log = require('../services/log')('subscriptions')
const uri = require('../services/uriManager')
const request = require('five-bells-shared/utils/request')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const Subscription = require('../models/subscription').Subscription
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')

function isOwner (requestingUser, subscription) {
  const requestOwner = uri.make('account', requestingUser.name)
  return requestOwner === subscription.owner
}

function isOwnerOrAdmin (requestingUser, subscription) {
  const requestOwner = uri.make('account', requestingUser.name)
  return requestOwner === subscription.owner || requestingUser.is_admin
}

function isSubjectOrAdmin (requestingUser, subscription) {
  const requestOwner = uri.make('account', requestingUser.name)
  return requestOwner === subscription.subject || requestingUser.is_admin
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

    const duplicateSubscription = yield Subscription.findOne({
      where: {
        event: subscription.event,
        subject: subscription.subject,
        target: subscription.target
      }
    }, { transaction })

    if (duplicateSubscription) {
      throw new UnprocessableEntityError('Subscription with same event, subject, and target already exists')
    }
    // Store subscription in database
    // TODO: Who to subscribe to should be defined by a separate `subject`
    //       field.
    yield Subscription.upsert(subscription, { transaction })
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
 * @apiUse UnauthorizedError
 *
 * @returns {void}
 */
exports.getResource = function * fetch () {
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  log.debug('fetching subscription ID ' + id)

  const subscription = yield Subscription.findById(id)
  if (!subscription) {
    throw new NotFoundError('Unknown subscription ID')
  } else if (!isOwnerOrAdmin(this.req.user, subscription)) {
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

  if (!isOwner(this.req.user, subscription)) {
    throw new UnauthorizedError('You do not own this account')
  } else if (!isSubjectOrAdmin(this.req.user, subscription)) {
    throw new UnauthorizedError('You are not authorized to listen to this account')
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
  let existed = yield Subscription.findById(id)
  yield * storeSubscription(subscription)

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
  let id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  const self = this

  log.debug('deleting subscription ID ' + id)

  yield db.transaction(function *(transaction) {
    const subscription = yield Subscription.findById(id, { transaction })

    if (!subscription) {
      throw new NotFoundError('Unknown subscription ID')
    }
    if (!isOwnerOrAdmin(self.req.user, subscription)) {
      throw new UnauthorizedError('You don\'t have permission to delete this subscription')
    }

    subscription.destroy({ transaction })
  })

  this.status = 204
}
