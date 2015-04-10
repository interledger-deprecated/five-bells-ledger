/* @flow */
'use strict';

const _ = require('lodash');
const diff = require('deep-diff');
const db = require('../services/db');
const config = require('../services/config');
const log = require('five-bells-shared/services/log')('transfers');
const request = require('co-request');
const requestUtil = require('five-bells-shared/utils/request');
const jsonld = require('five-bells-shared/utils/jsonld');
const InsufficientFundsError = require('../errors/insufficient-funds-error');
const NotFoundError = require('five-bells-shared/errors/not-found-error');
const InvalidModificationError =
  require('five-bells-shared/errors/invalid-modification-error');
const UnprocessableEntityError =
  require('five-bells-shared/errors/unprocessable-entity-error');

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
  requestUtil.validateUriParameter('id', id, 'Uuid');
  log.debug('fetching transfer ID ' + id);

  let transfer = yield db.get(['transfers', id]);
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID');
  }

  jsonld.setContext(this, 'transfer.jsonld');

  // Externally we want to use a full URI ID
  transfer.id = this.bells.base + '/transfers/' + transfer.id;

  this.body = transfer;
};

/**
 * @api {get} /transfers/:id/state Get the state of a transfer
 * @apiName GetTransferState
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to get a signed receipt containing only the id of
 *   transfer and its state.
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
exports.getState = function *getState(id) {
  requestUtil.validateUriParameter('id', id, 'Uuid');
  log.debug('fetching state receipt for transfer ID ' + id);

  let transfer = yield db.get(['transfers', id]);
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID');
  }

  let transferState = {
    id: this.bells.base + '/transfers/' + transfer.id,
    state: transfer.state,
    signature: {
      signer: 'blah.example',
      signed: true
    }
  };

  this.body = transferState;
};

function isConditionMet(transfer) {
  // TODO Actually check the ledger's signature
  return !transfer.execution_condition ||
         _.isEqual(transfer.execution_condition,
          transfer.execution_condition_fulfillment);
}

function updateTransferObject(originalTransfer, transfer) {
  // Ignore internally managed properties
  transfer.state = originalTransfer.state;

  // Clients may add authorizations
  originalTransfer.debits.forEach(function (funds, i) {
    if (!funds.authorization &&
        transfer.debits[i].authorization) {
      funds.authorization = transfer.debits[i].authorization;
    }
  });

  // Clients may fulfill the execution condition
  if (transfer.execution_condition_fulfillment &&
      !isConditionMet(originalTransfer)) {
    originalTransfer.execution_condition_fulfillment =
      transfer.execution_condition_fulfillment;
  }

  // The old and new objects should now be exactly equal
  if (!_.isEqual(originalTransfer, transfer)) {
    // If they aren't, this means the user tried to update something they're not
    // supposed to be able to modify.
    // TODO InvalidTransformationError
    throw new InvalidModificationError(
      'Transfer may not be modified in this way',
      diff(originalTransfer, transfer));
  }

  return originalTransfer;
}

function *processSubscriptions(transfer) {
  // TODO Get subscriptions for affected accounts only
  // TODO Get subscriptions for specific events only
  // const affectedAccounts = _([debitAccounts, creditAccounts])
  //   .map(_.keys).flatten().value();
  //
  // function getSubscriptions(account) {
  //   return db.get(['people', account, 'subscriptions']);
  // }
  // let subscriptions = (yield affectedAccounts.map(getSubscriptions))
  let externalTransfer = _.clone(transfer);
  externalTransfer.id = config.server.base_uri +
    '/transfers/' + transfer.id;
  let subscriptions = yield db.get(['subscriptions']);

  if (subscriptions) {
    subscriptions = _.values(subscriptions);

    const notifications = subscriptions.map(function (subscription) {
      log.debug('notifying ' + subscription.owner + ' at ' +
                subscription.target);

      return request(subscription.target, {
        method: 'post',
        json: true,
        body: {
          id: config.server.base_uri +
            '/subscriptions/' + subscription.id,
          event: 'transfer.update',
          host: config.server.base_host,
          resource: externalTransfer
        }
      });
    });

    yield notifications;
  }
}

function *processStateTransitions(tr, transfer) {
  // Calculate per-account totals
  let debitAccounts = _.groupBy(transfer.debits, function (debit) {
    return debit.account;
  });

  let creditAccounts = _.groupBy(transfer.credits, function (credit) {
    return credit.account;
  });

  for (let sender of Object.keys(debitAccounts)) {
    let debitAmounts = _.pluck(debitAccounts[sender], 'amount');
    let accountObj = yield tr.get(['people', sender]);

    if (typeof accountObj === 'undefined') {
      throw new UnprocessableEntityError(
        'Sender `' + sender + '` does not exist.');
    }

    debitAccounts[sender] = {
      balance: +accountObj.balance,
      totalAmount: +_.sum(debitAmounts)
    };
  }

  for (let recipient of Object.keys(creditAccounts)) {
    let creditAmounts = _.pluck(creditAccounts[recipient], 'amount');
    let accountObj = yield tr.get(['people', recipient]);

    if (typeof accountObj === 'undefined') {
      throw new UnprocessableEntityError(
        'Recipient `' + recipient + '` does not exist.');
    }

    creditAccounts[recipient] = {
      balance: +accountObj.balance,
      totalAmount: +_.sum(creditAmounts)
    };
  }

  // Check prerequisites
  if (transfer.state === 'proposed') {
    let sourceFunds = Array.isArray(transfer.debits)
                        ? transfer.debits
                        : [transfer.debits];
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
      log.debug('transfer transitioned from proposed to prepared');
      transfer.state = 'prepared';

      for (let sender of Object.keys(debitAccounts)) {
        let debitAccount = debitAccounts[sender];

        // Check senders' balances
        if (debitAccount.balance < debitAccount.totalAmount) {
          throw new InsufficientFundsError('Sender has insufficient funds.',
                                           sender);
        }

        // Take money out of senders' accounts
        log.debug('sender ' + sender + ' balance: ' + debitAccount.balance
                  + ' -> ' + (debitAccount.balance - debitAccount.totalAmount));
        tr.put(['people', sender, 'balance'],
               debitAccount.balance - debitAccount.totalAmount);
      }

    }
  }

  if (transfer.state === 'prepared') {
    if (isConditionMet(transfer)) {
      log.debug('transfer transitioned from prepared to accepted');
      transfer.state = 'accepted';
    }
  }

  if (transfer.state === 'accepted') {
    // In a real-world / asynchronous implementation, the response from the
    // external ledger would trigger the state transition from 'accepted' to
    // 'completed' or 'failed'.
    for (let recipient of Object.keys(creditAccounts)) {
      let creditAccount = creditAccounts[recipient];

      log.debug('recipient ' + recipient + ' balance: ' + creditAccount.balance
                + ' -> ' + (creditAccount.balance + creditAccount.totalAmount));

      tr.put(['people', recipient, 'balance'],
             creditAccount.balance + creditAccount.totalAmount);
    }

    log.debug('transfer transitioned from accepted to completed');
    transfer.state = 'completed';
  }

  yield processSubscriptions(transfer);
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
 *      "debits": {
 *        "account": "alice",
 *        "amount": "10"
 *      },
 *      "credits": {
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
  requestUtil.validateUriParameter('id', id, 'Uuid');
  let transfer = yield requestUtil.validateBody(this, 'Transfer');

  if (typeof transfer.id !== 'undefined') {
    requestUtil.assert.strictEqual(
      transfer.id,
      this.bells.base + '/transfers/' + id,
      'Transfer ID must match the URI'
    );
  }

  transfer.id = id;

  log.debug('putting transfer ID ' + transfer.id);
  log.debug('' + transfer.debits[0].account + ' -> ' +
            transfer.credits[0].account + ' : ' +
            transfer.credits[0].amount);

  // Do all static verification (signatures, validity, etc.) here

  // Verify debits
  let asset = transfer.debits[0].asset,
      totalDebits = 0,
      totalCredits = 0;

  transfer.debits.forEach(function (debit) {
    if (debit.amount <= 0) {
      throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.');
    }
    if (debit.asset && debit.asset !== asset) {
      throw new UnprocessableEntityError(
        'All debits must have the same asset type.');
    }
    totalDebits += parseFloat(debit.amount);
  });

  transfer.credits.forEach(function (credit) {
    if (credit.amount <= 0) {
      throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.');
    }
    if (credit.asset && credit.asset !== asset) {
      throw new UnprocessableEntityError(
        'All debits must have the same asset type.');
    }
    totalCredits += parseFloat(credit.amount);
  });

  if (totalCredits > totalDebits) {
    throw new UnprocessableEntityError(
      'Transfer may not create money.');
  }

  // TODO Validate signatures in authorizations
  // TODO Validate that the execution_condition_fulfillment is correct

  let originalTransfer;
  yield db.transaction(function *(tr) {
    originalTransfer = yield tr.get(['transfers', transfer.id]);
    if (originalTransfer) {
      log.debug('found an existing transfer with this ID');

      // This method will update the original transfer object using the new
      // version, but only allowing specific fields to change.
      transfer = updateTransferObject(originalTransfer, transfer);
    } else {
      log.debug('this is a new transfer');

      transfer.state = 'proposed';
    }

    yield processStateTransitions(tr, transfer);

    // Store transfer in database
    tr.put(['transfers', transfer.id], transfer);
  });

  log.debug('changes written to database');

  // Externally we want to use a full URI ID
  transfer.id = this.bells.base + '/transfers/' + id;

  this.body = transfer;
  this.status = originalTransfer ? 200 : 201;
};
