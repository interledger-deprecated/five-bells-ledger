'use strict';

var uuid = require('node-uuid');
var db = require('../services/db');
var log = require('../services/log')('holds');
var request = require('../services/request');

exports.fetch = function *fetch(id) {
  request.uri('id', id, 'Uuid');
  log.debug('fetching hold ID '+id);

  this.body = yield db.get(['holds', id]);
  if (!this.body) throw new NotFoundError('Unknown hold ID');
};

exports.create = function *create() {
  var _this = this;
  var hold = yield request.body(this, 'Hold');

  // Generate a unique hold ID outside of the transaction block
  hold.id = uuid.v4();
  log.debug('preparing hold ID '+hold.id);

  yield db.transaction(function *(tr) {
    // Don't process the transfer twice
    if (yield tr.get(['holds', hold.id])) return;

    // Check prerequisites
    var owner = yield tr.get(['people', hold.owner]);

    if ("undefined" === typeof owner) {
      throw new UnprocessableEntityError('Owner does not exist.');
    }
    if (owner.balance < hold.value) {
      throw new UnprocessableEntityError('Insufficient funds.');
    }

    log.debug('owner has balance '+owner.balance);

    // Store hold in database
    tr.put(['holds', hold.id], hold);

    // Update balances
    tr.put(['people', hold.owner, 'balance'], +owner.balance - +hold.value);
  });

  log.debug('hold created');

  this.body = hold;
};
