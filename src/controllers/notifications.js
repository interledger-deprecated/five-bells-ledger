'use strict'

const request = require('five-bells-shared/utils/request')
const model = require('../models/notifications')

/**
 * @api {get} /subscriptions/:subscription_id/notifications/:notification_id Get RESThook notification
 * @apiName GetNotification
 * @apiGroup Notification
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details of a notification
 *
 * @apiParam {String} id Subscription
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiParam {String} id Notification
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
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
