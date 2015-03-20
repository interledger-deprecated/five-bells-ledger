/* @flow */
'use strict';

const _ = require('lodash');
const diff = require('deep-diff');
const db = require('../services/db');
const log = require('five-bells-shared/services/log')('transfers');
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
  transfer.id = requestUtil.getBaseUri(this) + this.originalUrl;

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
    id: requestUtil.getBaseUri(this) + '/transfers/' + transfer.id,
    state: transfer.state,
    signature: {
      signer: 'blah.example',
      signed: true
    }
  };

  this.body = transferState;
};

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
    throw new InvalidModificationError(
      'Transfer may not be modified in this way',
      diff(originalTransfer, transfer));
  }

  return originalTransfer;
}

function isConditionMet(transfer) {
  // TODO Do the useful!
  return !transfer.execution_condition ||
         transfer.execution_condition_fulfillment;
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
      requestUtil.getBaseUri(this) + this.originalUrl,
      'Transfer ID must match the one in the URL'
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
    totalDebits += debit.amount;
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
    totalCredits += credit.amount;
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

  // function getSubscriptions(account) {
  //   return db.get(['people', account, 'subscriptions']);
  // }
  // let subscriptions = _(yield [
  //   getSubscriptions(transfer.debits.account),
  //   getSubscriptions(transfer.credits.account)
  // ]).flatten().map(function (x) {
  //   // Turning [{'abcdef...': { 'abcdef...': {}}}] into [{}]
  //   return _.first(_.values(_.first(_.values(x))));
  // }).filter(function (x) {
  //   return x && x.event === 'transfer.create';
  // }).value();
  //
  // subscriptions = subscriptions.filter(function (subscription) {
  //   console.log('subscription', subscription);
  //   return false;
  // });
  //
  // subscriptions.forEach(function (subscription) {
  //   log.debug('notifying ' + subscription.owner + ' at ' +
  //             subscription.target);
  // }, subscriptions);

  // Externally we want to use a full URI ID
  transfer.id = requestUtil.getBaseUri(this) + this.originalUrl;

  this.body = transfer;
  this.status = originalTransfer ? 200 : 201;
};
