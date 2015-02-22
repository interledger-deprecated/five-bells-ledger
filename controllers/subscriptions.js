'use strict';

var uuid = require('node-uuid');
var db = require('../services/db');
var log = require('../services/log')('subscriptions');
var request = require('../services/request');

exports.fetch = function *fetch(id) {
  request.validateUriParameter('id', id, 'Uuid');
  log.debug('fetching subscription ID '+id);

  this.body = yield db.get(['subscriptions', id]);
  if (!this.body) throw new NotFoundError('Unknown subscription ID');
};

exports.create = function *create() {
  var _this = this;
  var subscription = yield request.validateBody(this, 'Subscription');

  // Generate a unique subscription ID outside of the transaction block
  if (!subscription.id) subscription.id = uuid.v4();
  log.debug('preparing subscription ID '+subscription.id);

  yield db.transaction(function *(tr) {
    // Don't process the transfer twice
    if (yield tr.get(['subscriptions', subscription.id])) return;

    // Check prerequisites
    var owner = yield tr.get(['people', subscription.owner]);

    if ("undefined" === typeof owner) {
      throw new UnprocessableEntityError('Owner does not exist.');
    }
    // Store subscription in database
    tr.put(['people', subscription.owner, 'subscriptions', subscription.id], subscription);
  });

  log.debug('subscription created');

  this.body = subscription;
  this.status = 201;
};
