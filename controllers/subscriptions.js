'use strict';

var uuid = require('uuid4');
var db = require('../services/db');
var log = require('../services/log')('subscriptions');
var request = require('../services/request');
var NotFoundError = require('../errors/not-found-error');

/**
 * @api {get} /subscriptions/:id Get RESThook subscription
 * @apiName GetSubscription
 * @apiGroup Subscription
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details or status of a subscription.
 *
 * @apiParam {String} id Subscription [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 */
exports.fetch = function *fetch(id) {
  request.validateUriParameter('id', id, 'Uuid');
  log.debug('fetching subscription ID '+id);

  this.body = yield db.get(['subscriptions', id]);
  if (!this.body) throw new NotFoundError('Unknown subscription ID');
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
 */
exports.create = function *create() {
  var _this = this;
  var subscription = yield request.validateBody(this, 'Subscription');

  // Generate a unique subscription ID outside of the transaction block
  if (!subscription.id) subscription.id = uuid();
  log.debug('preparing subscription ID '+subscription.id);

  // Validate and store subscription in database
  yield *storeSubscription(subscription);

  log.debug('subscription created');

  this.body = subscription;
  this.status = 201;
};

exports.update = function *update(id) {
  var _this = this;

  request.validateUriParameter('id', id, 'Uuid');
  var subscription = yield request.validateBody(this, 'Subscription');

  if ("undefined" !== subscription.id) {
    request.assert.strictEqual(subscription.id, id, "Subscription ID must match the one in the URL");
  } else {
    subscription.id = id;
  }

  log.debug('updating subscription ID '+subscription.id);

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
 * @apiParam {String} id Subscription [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 */
exports.remove = function *remove(id) {
  request.validateUriParameter('id', id, 'Uuid');

  log.debug('deleting subscription ID '+id);

  yield db.transaction(function *(tr) {
    var subscription = yield tr.get(['subscriptions', id]);

    if (!subscription) {
      throw new NotFoundError('Unknown subscription ID');
    }

    tr.remove(['subscriptions', id]);
  });

  this.status = 204;
};

/**
 * Store a subscription in the database.
 */
function *storeSubscription(subscription) {
  yield db.transaction(function *(tr) {
    // Check prerequisites
    yield *validateSubscriptionSemantics(subscription, tr);

    // Store subscription in database
    // TODO: Who to subscribe to should be defined by a separate `subject` field.
    tr.put(['people', subscription.owner, 'subscriptions', subscription.id], subscription);
  });
}

/**
 * Validate a subscription semantically.
 *
 * We use schemas to validate data syntactically, this method takes care of all
 * remaining validations.
 */
function *validateSubscriptionSemantics(subscription, tr) {
  var owner = yield tr.get(['people', subscription.owner]);

  if ("undefined" === typeof owner) {
    throw new UnprocessableEntityError('Owner does not exist.');
  }
}
