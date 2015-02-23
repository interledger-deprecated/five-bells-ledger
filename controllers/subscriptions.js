'use strict';

var uuid = require('uuid4');
var db = require('../services/db');
var log = require('../services/log')('subscriptions');
var request = require('../services/request');

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
 * @api {get} /transfers/:id Make a local transfer
 * @apiName PutTransfer
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiParam {String} id Transfer [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiParamExample {json} Request Body Example
 *    {
 *      "id": "155dff3f-4915-44df-a707-acc4b527bcbd",
 *      "source": {
 *        "owner": "alice",
 *        "amount": "10"
 *      },
 *      "destination": {
 *        "owner": "bob",
 *        "amount": "10"
 *      }
 *    }
 *
 * @apiUse InsufficientFundsError
 * @apiUse UnprocessableEntityError
 * @apiUse AlreadyExistsError
 * @apiUse InvalidUriParameterError
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

exports.update = function *update() {
  var _this = this;
  var subscription = yield request.validateBody(this, 'Subscription');

  log.debug('updating subscription ID '+subscription.id);

  // Validate and store subscription in database
  yield *storeSubscription(subscription);

  log.debug('update completed');

  this.body = subscription;
}

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
