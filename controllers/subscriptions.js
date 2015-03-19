'use strict';

const uuid = require('uuid4');
const db = require('../services/db');
const log = require('../services/log')('subscriptions');
const request = require('../utils/request');
const NotFoundError = require('../errors/not-found-error');
const UnprocessableEntityError =
require('../errors/unprocessable-entity-error');

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
function *validateSubscriptionSemantics(subscription, tr) {
  const owner = yield tr.get(['people', subscription.owner]);

  if (typeof owner === 'undefined') {
    throw new UnprocessableEntityError('Owner does not exist.');
  }
}

/**
 * Store a subscription in the database.
 *
 * @param {Object} subscription Subscription
 * @returns {void}
 */
function *storeSubscription(subscription) {
  yield db.transaction(function *(tr) {
    // Check prerequisites
    yield *validateSubscriptionSemantics(subscription, tr);

    // Store subscription in database
    // TODO: Who to subscribe to should be defined by a separate `subject`
    //       field.
    tr.put(['people', subscription.owner, 'subscriptions', subscription.id],
           subscription);
  });
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
 * @param {String} id Transfer UUID
 * @returns {void}
 */
exports.fetch = function *fetch(id) {
  request.validateUriParameter('id', id, 'Uuid');
  log.debug('fetching subscription ID ' + id);

  this.body = yield db.get(['subscriptions', id]);
  if (!this.body) {
    throw new NotFoundError('Unknown subscription ID');
  }
};

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
exports.create = function *create() {
  const subscription = yield request.validateBody(this, 'Subscription');

  // Generate a unique subscription ID outside of the transaction block
  if (!subscription.id) {
    subscription.id = uuid();
  }
  log.debug('preparing subscription ID ' + subscription.id);

  // Validate and store subscription in database
  yield *storeSubscription(subscription);

  log.debug('subscription created');

  this.body = subscription;
  this.status = 201;
};

exports.update = function *update(id) {
  request.validateUriParameter('id', id, 'Uuid');
  const subscription = yield request.validateBody(this, 'Subscription');

  if (typeof subscription.id !== 'undefined') {
    request.assert.strictEqual(subscription.id, id,
      'Subscription ID must match the one in the URL');
  } else {
    subscription.id = id;
  }

  log.debug('updating subscription ID ' + subscription.id);

  // Validate and store subscription in database
  yield *storeSubscription(subscription);

  log.debug('update completed');

  this.body = subscription;
};

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
 * @param {String} id UUID of the subscription
 * @returns {void}
 */
exports.remove = function *remove(id) {
  request.validateUriParameter('id', id, 'Uuid');

  log.debug('deleting subscription ID ' + id);

  yield db.transaction(function *(tr) {
    const subscription = yield tr.get(['subscriptions', id]);

    if (!subscription) {
      throw new NotFoundError('Unknown subscription ID');
    }

    tr.remove(['subscriptions', id]);
  });

  this.status = 204;
};
