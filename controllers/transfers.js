/* @flow */
'use strict';

const _ = require('lodash');
const diff = require('deep-diff');
const tweetnacl = require('tweetnacl');
const db = require('../services/db');
const config = require('../services/config');
const transferExpiryMonitor = require('../services/transferExpiryMonitor');
const log = require('five-bells-shared/services/log')('transfers');
const request = require('co-request');
const requestUtil = require('five-bells-shared/utils/request');
const verifyCondition =
  require('five-bells-shared/utils/verifyCondition');
const jsonld = require('five-bells-shared/utils/jsonld');
const hashJSON = require('five-bells-shared/utils/hashJson');
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
  id = id.toLowerCase();
  log.debug('fetching transfer ID ' + id);

  let transfer = yield db.get(['transfers', id]);
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID');
  }

  jsonld.setContext(this, 'transfer.jsonld');

  // Externally we want to use a full URI ID
  transfer.id = config.server.base_uri + '/transfers/' + transfer.id;

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
  id = id.toLowerCase();
  log.debug('fetching state receipt for transfer ID ' + id);

  let transfer = yield db.get(['transfers', id]);
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID');
  }

  let message = {
    id: config.server.base_uri + '/transfers/' + transfer.id,
    state: transfer.state
  };
  let messageHash = hashJSON(message);
  let signature = tweetnacl.util.encodeBase64(
    tweetnacl.sign.detached(
      tweetnacl.util.decodeBase64(messageHash),
      tweetnacl.util.decodeBase64(config.keys.ed25519.secret)));

  let transferStateReceipt = {
    message: message,
    algorithm: 'ed25519-sha512',
    signer: config.server.base_uri,
    public_key: config.keys.ed25519.public,
    signature: signature
  };

  this.body = transferStateReceipt;
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
  if (transfer.execution_condition_fulfillment) {
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
  //   return db.get(['accounts', account, 'subscriptions']);
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
    let accountObj = yield tr.get(['accounts', sender]);

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
    let accountObj = yield tr.get(['accounts', recipient]);

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
      log.debug('transfer transitioned from proposed to pre_prepared');
      transfer.state = 'pre_prepared';
    }
  }

  if (transfer.state === 'pre_prepared') {
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
      tr.put(['accounts', sender, 'balance'],
             debitAccount.balance - debitAccount.totalAmount);
    }

    log.debug('transfer transitioned from pre_prepared to prepared');
    transfer.state = 'prepared';
  }

  if (transfer.state === 'prepared') {

    if (transfer.execution_condition &&
      transfer.execution_condition_fulfillment) {
        // This will throw an error if the fulfillment is invalid
        verifyCondition(transfer.execution_condition,
          transfer.execution_condition_fulfillment);
        log.debug('transfer transitioned from prepared to pre_executed');
        transfer.state = 'pre_executed';

    } else if (!transfer.execution_condition) {
      log.debug('transfer transitioned from prepared to pre_executed');
      transfer.state = 'pre_executed';
    }
  }

  if (transfer.state === 'pre_executed') {
    // In a real-world / asynchronous implementation, the response from the
    // external ledger would trigger the state transition from 'pre_executed' to
    // 'executed' or 'failed'.
    for (let recipient of Object.keys(creditAccounts)) {
      let creditAccount = creditAccounts[recipient];

      log.debug('recipient ' + recipient + ' balance: ' + creditAccount.balance
                + ' -> ' + (creditAccount.balance + creditAccount.totalAmount));

      tr.put(['accounts', recipient, 'balance'],
             creditAccount.balance + creditAccount.totalAmount);
    }

    log.debug('transfer transitioned from pre_executed to executed');
    transfer.state = 'executed';

    // Remove the expiry countdown
    transferExpiryMonitor.unwatch(transfer.id);
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
  id = id.toLowerCase();
  let transfer = yield requestUtil.validateBody(this, 'Transfer');

  // Do not allow modifications after the expires_at date
  transferExpiryMonitor.validateNotExpired(transfer);

  if (typeof transfer.id !== 'undefined') {
    transfer.id = transfer.id.toLowerCase();
    requestUtil.assert.strictEqual(
      transfer.id,
      config.server.base_uri + '/transfers/' + id,
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
  let totalDebits = 0,
      totalCredits = 0;

  transfer.debits.forEach(function (debit) {
    if (debit.amount <= 0) {
      throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.');
    }
    totalDebits += parseFloat(debit.amount);
  });

  transfer.credits.forEach(function (credit) {
    if (credit.amount <= 0) {
      throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.');
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

    // Start the expiry countdown
    // If the expires_at has passed by this time we'll consider
    // the transfer to have made it in before the deadline
    transferExpiryMonitor.watch(transfer);
  });

  log.debug('changes written to database');

  // Externally we want to use a full URI ID
  transfer.id = config.server.base_uri + '/transfers/' + id;

  this.body = transfer;
  this.status = originalTransfer ? 200 : 201;
};
