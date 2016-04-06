'use strict'

const request = require('five-bells-shared/utils/request')
const model = require('../models/notifications')

/**
 * @api {get} /subscriptions/:subscription_id/notifications/:notification_id Get RESThook notification
 * @apiName GetNotification
 * @apiGroup Notification
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details of a notification. Only accounts
 *    that were related to the notification event are authorized.
 *
 * @apiParam {String} id Subscription
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiParam {String} id Notification
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiExample {shell} Get notification
 *    curl -x GET -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l" http://usd-ledger.example/USD/subscriptions/f49697a6-d52c-4f46-84c8-9070a31feab7/notifications/89ae630b-959a-47cc-adcf-d7be85e310c0
 *
 * @apiSuccessExample {json} 200 Notification Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/USD/subscriptions/f49697a6-d52c-4f46-84c8-9070a31feab7/notifications/89ae630b-959a-47cc-adcf-d7be85e310c0",
 *      "subscription": "http://usd-ledger.example/USD/subscriptions/f49697a6-d52c-4f46-84c8-9070a31feab7",
 *      "event": "transfer.update",
 *      "resource": {
 *        "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *        "ledger": "http://usd-ledger.example/USD",
 *        "debits": [{
 *          "account": "http://usd-ledger.example/USD/accounts/alice",
 *          "amount": "50"
 *        }],
 *        "credits": [{
 *          "account": "http://usd-ledger.example/USD/accounts/bob",
 *          "amount": "50"
 *        }],
 *        "execution_condition": "cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2",
 *        "expires_at": "2015-06-16T00:00:01.000Z",
 *        "state": "executed"
 *      },
 *      "related_resources": {
 *        "execution_condition_fulfillment": "cf:0:_v8"
 *      }
 *    }
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 * @apiUse UnauthorizedError
 *
 * @returns {void}
 */
function * getResource () {
  const subscriptionId = this.params.subscription_id
  request.validateUriParameter('id', subscriptionId, 'Uuid')

  const notificationId = this.params.notification_id
  request.validateUriParameter('id', notificationId, 'Uuid')
  this.body = yield model.getNotification(subscriptionId.toLowerCase(), notificationId.toLowerCase(), this.req.user)
}

module.exports = {
  getResource
}
