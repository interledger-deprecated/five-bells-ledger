'use strict'

const request = require('five-bells-shared/utils/request')
const model = require('../models/subscriptions')

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
 * @apiExample {shell} Get subscription
 *    curl -x GET -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l" http://usd-ledger.example/USD/subscriptions/f49697a6-d52c-4f46-84c8-9070a31feab7
 *
 * @apiSuccessExample {json} 200 Notification Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/USD/subscriptions/f49697a6-d52c-4f46-84c8-9070a31feab7",
 *      "owner": "http://usd-ledger.example/USD/accounts/alice",
 *      "subject": "http://usd-ledger.example/USD/accounts/alice",
 *      "event": "transfer.update",
 *      "target": "http://subscriber.example/notifications"
 *    }
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 * @apiUse UnauthorizedError
 *
 * @returns {void}
 */
function * getResource () {
  const id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  this.body = yield model.getSubscription(id.toLowerCase(), this.req.user)
}

/**
 * @api {put} /subscriptions Subscribe to an event
 * @apiName PutSubscription
 * @apiGroup Subscription
 * @apiVersion 1.0.0
 *
 * @apiDescription Note that the format of the notification `POST`ed to the `target`
 *    is the same as what is returned from `GET /subscriptions/:subscription_id/notifications/:notification_id`
 *
 * @apiParamExample {json} Request Body Example
 *     {
 *       "id": "f49697a6-d52c-4f46-84c8-9070a31feab7",
 *       "owner": "http://usd-ledger.example/USD/accounts/alice",
 *       "event": "transfer.create",
 *       "target": "http://subscriber.example/notifications"
 *     }
 *
 * @apiUse InvalidBodyError
 * @apiUse UnauthorizedError
 *
 * @returns {void}
 */
function * putResource () {
  const id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  const subscription = this.body

  if (typeof subscription.id !== 'undefined') {
    request.assert.strictEqual(
      subscription.id.toLowerCase(), id.toLowerCase(),
      'Subscription ID must match the one in the URL')
  }

  subscription.id = id.toLowerCase()
  const result = yield model.setSubscription(subscription, this.req.user)
  this.body = result.subscription
  this.status = result.existed ? 200 : 201
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
function * deleteResource () {
  const id = this.params.id
  request.validateUriParameter('id', id, 'Uuid')
  yield model.deleteSubscription(id.toLowerCase(), this.req.user)
  this.status = 204
}

module.exports = {
  getResource,
  putResource,
  deleteResource
}
