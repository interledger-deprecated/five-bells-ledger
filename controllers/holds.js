'use strict';

var db = require('../services/db');
var log = require('../services/log')('holds');
var request = require('../services/request');
var UnprocessableEntityError = require('../errors/unprocessable-entity-error');
var InsufficientFundsError = require('../errors/insufficient-funds-error');
var NotFoundError = require('../errors/not-found-error');
var AlreadyExistsError = require('../errors/already-exists-error');

/**
 * @api {get} /holds/:id Get local hold object
 * @apiName GetHold
 * @apiGroup Hold
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details or status of a funds hold.
 *
 * @apiParam {String} id Hold [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 */
exports.fetch = function *fetch(id) {
  request.validateUriParameter('id', id, 'Uuid');
  log.debug('fetching hold ID '+id);

  this.body = yield db.get(['holds', id]);
  if (!this.body) throw new NotFoundError('Unknown hold ID');
};

/**
 * @api {put} /holds/:id Place a hold on funds
 * @apiName PutHold
 * @apiGroup Hold
 * @apiVersion 1.0.0
 *
 * @apiParam {String} id Hold [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiParamExample {json} Request Body Example
 *    {
 *      "id": "155dff3f-4915-44df-a707-acc4b527bcbd",
 *      "source": {
 *        "owner": "alice",
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
exports.create = function *create(id) {
  var _this = this;

  request.validateUriParameter('id', id, 'Uuid');
  var hold = yield request.validateBody(this, 'Hold');

  if ("undefined" !== hold.id) {
    request.assert.strictEqual(
      hold.id,
      id,
      "Hold ID must match the one in the URL"
    );
  } else {
    hold.id = id;
  }

  log.debug('preparing hold ID '+hold.id);

  yield db.transaction(function *(tr) {
    // Don't process the hold twice
    if (yield tr.get(['holds', hold.id])) {
      throw new AlreadyExistsError('This hold already exists');
    }

    // Check prerequisites
    var owner = yield tr.get(['people', hold.source.owner]);

    if ("undefined" === typeof owner) {
      throw new UnprocessableEntityError('Owner does not exist.');
    }
    if (owner.balance < hold.source.amount) {
      throw new UnprocessableEntityError('Insufficient funds.');
    }
    if (hold.source.amount <= 0) {
      throw new UnprocessableEntityError('Amount must be a positive number excluding zero.');
    }

    log.debug('owner has balance '+owner.balance);

    // Store hold in database
    tr.put(['holds', hold.id], hold);

    // Update balances
    tr.put(['people', hold.source.owner, 'balance'], +owner.balance - +hold.source.amount);
  });

  log.debug('hold created');

  this.status = 201;
  this.body = hold;
};
