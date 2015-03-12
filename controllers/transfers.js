/* @flow */
'use strict';

const _ = require('lodash');
const db = require('../services/db');
const log = require('../services/log')('transfers');
const request = require('../utils/request');
const jsonld = require('../utils/jsonld');
const UnprocessableEntityError = require('../errors/unprocessable-entity-error');
const InsufficientFundsError = require('../errors/insufficient-funds-error');
const NotFoundError = require('../errors/not-found-error');
const AlreadyExistsError = require('../errors/already-exists-error');

/**
 * @api {get} /transfers/:id Get local transfer object
 * @apiName GetTransfer
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details or status of a local
 *   transfer.
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 */
exports.fetch = function *fetch(id) {
  request.validateUriParameter('id', id, 'Uuid');
  log.debug('fetching transfer ID ' + id);

  let transfer = yield db.get(['transfers', id]);
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID');
  }

  jsonld.setContext(this, 'transfer.jsonld');
  this.body = transfer;
};

/**
 * @api {put} /transfers/:id Make a local transfer
 * @apiName PutTransfer
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiParamExample {json} Request Body Example
 *    {
 *      "id": "155dff3f-4915-44df-a707-acc4b527bcbd",
 *      "source_funds": {
 *        "account": "alice",
 *        "amount": "10"
 *      },
 *      "destination_funds": {
 *        "account": "bob",
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
  request.validateUriParameter('id', id, 'Uuid');
  let transfer = yield request.validateBody(this, 'Transfer');

  if (typeof transfer.id !== 'undefined') {
    request.assert.strictEqual(
      transfer.id,
      id,
      'Transfer ID must match the one in the URL'
    );
  } else {
    transfer.id = id;
  }

  log.debug('preparing transfer ID ' + transfer.id);
  log.debug('' + transfer.source_funds.account + ' -> ' +
            transfer.destination_funds.account + ' : ' +
            transfer.destination_funds.amount);

  yield db.transaction(function *(tr) {
    // Don't process the transfer twice
    if (yield tr.get(['transfers', transfer.id])) {
      throw new AlreadyExistsError('This transfer already exists');
    }

    // Check prerequisites
    let sender = yield tr.get(['people', transfer.source_funds.account]);
    let recipient = yield tr.get(['people', transfer.destination_funds.account]);

    if (typeof sender === 'undefined') {
      throw new UnprocessableEntityError('Sender does not exist.');
    }
    if (typeof recipient === 'undefined') {
      throw new UnprocessableEntityError('Recipient does not exist.');
    }
    if (transfer.source_funds.amount <= 0) {
      throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.');
    }
    if (transfer.source_funds.amount !== transfer.destination_funds.amount) {
      throw new UnprocessableEntityError(
        'Source and destination amounts do not match.');
    }
    if (sender.balance < transfer.source_funds.amount) {
      throw new InsufficientFundsError('Sender has insufficient funds.',
                                       transfer.source_funds.account);
    }

    // Store transfer in database
    tr.put(['transfers', transfer.id], transfer);

    // Update balances
    log.debug('sender balance: ' + sender.balance + ' -> ' +
              (+sender.balance - +transfer.destination_funds.amount));
    log.debug('recipient balance: ' + recipient.balance + ' -> ' +
              (+recipient.balance + +transfer.destination_funds.amount));

    tr.put(['people', transfer.source_funds.account, 'balance'],
           +sender.balance - +transfer.destination_funds.amount);
    tr.put(['people', transfer.destination_funds.account, 'balance'],
           +recipient.balance + +transfer.destination_funds.amount);
  });

  log.debug('transfer completed');

  function getSubscriptions(account) {
    return db.get(['people', account, 'subscriptions']);
  }
  let subscriptions = _(yield [
    getSubscriptions(transfer.source_funds.account),
    getSubscriptions(transfer.destination_funds.account)
  ]).flatten().map(function (x) {
    // Turning [{'abcdef...': { 'abcdef...': {}}}] into [{}]
    return _.first(_.values(_.first(_.values(x))));
  }).filter(function (x) {
    return x && x.event === 'transfer.create';
  }).value();

  subscriptions = subscriptions.filter(function (subscription) {
    console.log('subscription', subscription);
    return false;
  });

  subscriptions.forEach(function (subscription) {
    log.debug('notifying ' + subscription.owner + ' at ' + subscription.target);
  }, subscriptions);

  this.body = transfer;
  this.status = 201;
};
