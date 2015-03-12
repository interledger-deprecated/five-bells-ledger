/* @flow */
'use strict';

const _ = require('lodash');
const db = require('../services/db');
const log = require('../services/log')('transfers');
const request = require('../utils/request');
const jsonld = require('../utils/jsonld');
const InsufficientFundsError = require('../errors/insufficient-funds-error');
const NotFoundError = require('../errors/not-found-error');
const UnprocessableEntityError =
  require('../errors/unprocessable-entity-error');

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
 *
 * @param {String} id Transfer UUID
 * @returns {void}
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

function updateTransferObject(originalTransfer, transfer) {
  // Clients may add authorizations
  originalTransfer.source_funds.forEach(function (funds, i) {
    if (!funds.authorization &&
        transfer.source_funds[i].authorization) {
      funds.authorization = transfer.source_funds[i].authorization;
    }
  });

  // Clients may fulfill the execution condition
  if (!originalTransfer.execution_condition_fulfillment &&
      transfer.execution_condition_fulfillment) {
    originalTransfer.execution_condition_fulfillment =
      transfer.execution_condition_fulfillment;
  }

  // The old and new objects should now be exactly equal
  if (!_.isEqual(originalTransfer, transfer)) {
    // If they aren't, this means the user tried to update something they're not
    // supposed to be able to modify.
    // TODO InvalidTransformationError
    throw new Error();
  }

  return originalTransfer;
}

function isConditionMet(transfer) {
  // TODO Do the useful!
  return !transfer.execution_condition ||
         transfer.execution_condition_fulfillment;
}

function *processStateTransitions(tr, transfer) {
  // Check prerequisites
  let sender = yield tr.get(['people', transfer.source_funds.account]);
  let recipient =
    yield tr.get(['people', transfer.destination_funds.account]);

  if (typeof sender === 'undefined') {
    throw new UnprocessableEntityError('Sender does not exist.');
  }
  if (typeof recipient === 'undefined') {
    throw new UnprocessableEntityError('Recipient does not exist.');
  }

  if (transfer.state === 'proposed') {
    let sourceFunds = Array.isArray(transfer.source_funds)
                        ? transfer.source_funds
                        : [transfer.source_funds];
    let authorized = true;
    sourceFunds.forEach(function (funds) {
      if (!funds.authorization) {
        authorized = false;
      } else {
        // TODO Validate authorization public keys
        _.noop();
      }
    });

    if (authorized) {
      log.debug(`transfer transitioned from proposed to prepared`);
      transfer.state = 'prepared';
      if (sender.balance < transfer.source_funds.amount) {
        throw new InsufficientFundsError('Sender has insufficient funds.',
                                         transfer.source_funds.account);
      }

      // Take money out of sender's account
      log.debug('sender balance: ' + sender.balance + ' -> ' +
                (+sender.balance - +transfer.destination_funds.amount));
      tr.put(['people', transfer.source_funds.account, 'balance'],
             +sender.balance - +transfer.destination_funds.amount);
    }
  }

  if (transfer.state === 'prepared') {
    if (isConditionMet(transfer)) {
      log.debug(`transfer transitioned from prepared to accepted`);
      transfer.state = 'accepted';
    }
  }

  if (transfer.state === 'accepted') {
    // In a real-world / asynchronous implementation, the response from the
    // external ledger would trigger the state transition from 'accepted' to
    // 'completed' or 'failed'.
    log.debug('recipient balance: ' + recipient.balance + ' -> ' +
        (+recipient.balance + +transfer.destination_funds.amount));

    tr.put(['people', transfer.destination_funds.account, 'balance'],
     +recipient.balance + +transfer.destination_funds.amount);

    log.debug(`transfer transitioned from accepted to completed`);
    transfer.state = 'completed';
  }
}

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
 *
 * @param {String} id Transfer UUID
 * @returns {void}
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

  transfer.state = 'proposed';

  log.debug('putting transfer ID ' + transfer.id);
  log.debug('' + transfer.source_funds.account + ' -> ' +
            transfer.destination_funds.account + ' : ' +
            transfer.destination_funds.amount);

  // Do all static verification (signatures, validity, etc.) here
  if (transfer.source_funds.amount <= 0) {
    throw new UnprocessableEntityError(
      'Amount must be a positive number excluding zero.');
  }
  if (transfer.source_funds.amount !== transfer.destination_funds.amount) {
    throw new UnprocessableEntityError(
      'Source and destination amounts do not match.');
  }
  // TODO Validate signatures in authorizations
  // TODO Validate that the execution_condition_fulfillment is correct

  yield db.transaction(function *(tr) {
    let originalTransfer = yield tr.get(['transfers', transfer.id]);
    if (originalTransfer) {
      log.debug('found an existing transfer with this ID');

      // This method will update the original transfer object using the new
      // version, but only allowing specific fields to change.
      transfer = updateTransferObject(originalTransfer, transfer);
    } else {
      log.debug('this is a new transfer');
    }

    yield processStateTransitions(tr, transfer);

    // Store transfer in database
    tr.put(['transfers', transfer.id], transfer);
  });

  log.debug('changes written to database');

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
