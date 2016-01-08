/* @flow */
'use strict'

const _ = require('lodash')
const diff = require('deep-diff')
const tweetnacl = require('tweetnacl')
const db = require('../services/db')
const makeAccountBalances = require('../lib/accountBalances')
const hasDisabledAccounts = require('../lib/disabledAccounts')
const config = require('../services/config')
const uri = require('../services/uriManager')
const transferExpiryMonitor = require('../services/transferExpiryMonitor')
const notificationWorker = require('../services/notificationWorker')
const log = require('../services/log')('transfers')
const requestUtil = require('five-bells-shared/utils/request')
const updateState = require('../lib/updateState')
const jsonld = require('five-bells-shared/utils/jsonld')
const hashJSON = require('five-bells-shared/utils/hashJson')
const Transfer = require('../models/transfer').Transfer
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const InvalidUriParameterError = require('five-bells-shared/errors/invalid-uri-parameter-error')
const UnmetConditionError = require('five-bells-shared/errors/unmet-condition-error')
const InvalidModificationError =
require('five-bells-shared/errors/invalid-modification-error')
const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')
const UnauthorizedError =
require('five-bells-shared/errors/unauthorized-error')

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
 * @returns {void}
 */
exports.getResource = function * fetch () {
  let id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  log.debug('fetching transfer ID ' + id)

  let transfer = yield Transfer.findById(id)
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID')
  }

  jsonld.setContext(this, 'transfer.jsonld')

  this.body = transfer.getDataExternal()
}

/**
 * @api {get} /transfers/:id/state Get the state of a transfer
 * @apiName GetTransferState
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to get a signed receipt containing only the id of
 *   transfer and its state. It functions even if the transfer doesn't exist yet.
 *   If the transfer doesn't exist it will have the state "nonexistent".
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 * @apiParam {String} type The signature type
 *
 * @apiUse InvalidUriParameterError
 *
 * @returns {void}
 */
exports.getStateResource = function * getState () {
  let id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  log.debug('fetching state receipt for transfer ID ' + id)

  let signatureType = this.query.type || 'ed25519-sha512'
  let transfer = yield Transfer.findById(id)
  let transferState = transfer ? transfer.state : 'nonexistent'

  let message = {
    id: uri.make('transfer', id),
    state: transferState
  }
  let messageHash = hashJSON(message)

  let transferStateReceipt = {
    type: signatureType,
    message: message,
    signer: config.server.base_uri
  }
  if (signatureType === 'ed25519-sha512') {
    transferStateReceipt.public_key = config.keys.ed25519.public
    transferStateReceipt.signature = tweetnacl.util.encodeBase64(
      tweetnacl.sign.detached(
        tweetnacl.util.decodeBase64(messageHash),
        tweetnacl.util.decodeBase64(config.keys.ed25519.secret)))
  // TODO add support for 'sha256'
  } else {
    throw new InvalidUriParameterError('type is not valid')
  }

  this.body = transferStateReceipt
}

function updateTransferObject (originalTransfer, transfer) {
  let updatedTransferData = originalTransfer.getData()

  // Ignore null properties
  updatedTransferData = _.omit(updatedTransferData, _.isNull)

  // Ignore internally managed properties
  transfer.state = updatedTransferData.state
  transfer.created_at = updatedTransferData.created_at
  transfer.updated_at = updatedTransferData.updated_at
  transfer.proposed_at = updatedTransferData.proposed_at
  transfer.prepared_at = updatedTransferData.prepared_at
  transfer.executed_at = updatedTransferData.executed_at
  transfer.rejected_at = updatedTransferData.rejected_at

  // Ignore undefined properties
  const transferData = _.omit(transfer.getData(), _.isUndefined)

  // Clients can add authorizations
  // The validity of these authorizations will be checked
  // in the validateAuthorizations function
  _.forEach(updatedTransferData.debits, function (funds, i) {
    if (!funds.authorized &&
      transfer.debits[i] &&
      transfer.debits[i].authorized) {
      funds.authorized = true
    }
  })
  _.forEach(updatedTransferData.credits, function (funds, i) {
    if (!funds.authorized &&
      transfer.credits[i] &&
      transfer.credits[i].authorized) {
      funds.authorized = true
    }
  })

  // Clients may fulfill the execution/cancellation conditions
  if (transfer.execution_condition_fulfillment) {
    updatedTransferData.execution_condition_fulfillment =
      transfer.execution_condition_fulfillment
  }
  if (transfer.cancellation_condition_fulfillment) {
    updatedTransferData.cancellation_condition_fulfillment =
      transfer.cancellation_condition_fulfillment
  }

  // The old and new objects should now be exactly equal
  if (!_.isEqual(updatedTransferData, transferData)) {
    // If they aren't, this means the user tried to update something they're not
    // supposed to be able to modify.
    // TODO InvalidTransformationError
    throw new InvalidModificationError(
      'Transfer may not be modified in this way',
      diff(updatedTransferData, transferData))
  }

  originalTransfer.setData(updatedTransferData)
  return originalTransfer
}

function validateAuthorizations (authorizedAccount, transfer, previousDebits) {
  // Check that the authorizedAccount is actually relevant to this transfer
  if (authorizedAccount) {
    if (!_.includes(_.pluck(transfer.debits, 'account'), authorizedAccount) &&
      !_.includes(_.pluck(transfer.credits, 'account'), authorizedAccount)) {
      // TODO: should this error be more specific or would that create
      // a security vulnerability?
      throw new UnauthorizedError('Unknown or invalid account / password')
    }
  }

  // Go through each of the debits in the transfer
  // Throw an error if authorized is set to true on any debit
  // that was not set to true on the transferFromDb and is not
  // owned by the authorizedAccount
  _.forEach(transfer.debits, function (debit, debitIndex) {
    // We don't care about debits where no one is attempting
    // to mark them as authorized
    if (!debit.authorized) {
      return
    }

    if (debit.account !== authorizedAccount &&
      (!previousDebits || !previousDebits[debitIndex].authorized)) {
      throw new UnauthorizedError('Invalid attempt to authorize debit')
    }
  })

// TODO: add credit authorization
}

function * processStateTransitions (tr, transfer) {
  // Calculate per-account totals
  let accountBalances = yield makeAccountBalances(tr, transfer)

  // Check prerequisites
  if (transfer.state === 'proposed') {
    let sourceFunds = Array.isArray(transfer.debits)
      ? transfer.debits
      : [transfer.debits]
    let authorized = true
    sourceFunds.forEach(function (funds) {
      if (!funds.authorized) {
        authorized = false
      } else {
        // TODO Validate authorization public keys
        _.noop()
      }
    })

    if (authorized) {
      // Hold sender funds
      yield accountBalances.applyDebits()
      updateState(transfer, 'prepared')
    }
  }

  if (transfer.state === 'prepared' && transfer.hasFulfillment('execution')) {
    if (!transfer.hasValidFulfillment('execution')) {
      throw new UnmetConditionError('ConditionFulfillment failed')
    }
    yield accountBalances.applyCredits()

    // Remove the expiry countdown
    transferExpiryMonitor.unwatch(transfer.id)

    updateState(transfer, 'executed')
  }

  let canRejectState = transfer.state === 'proposed' || transfer.state === 'prepared'
  if (canRejectState && transfer.cancellation_condition_fulfillment) {
    if (!transfer.hasValidFulfillment('cancellation')) {
      throw new UnmetConditionError('ConditionFulfillment failed')
    }
    if (transfer.state === 'prepared') {
      yield accountBalances.revertDebits()
    }
    updateState(transfer, 'rejected')
    transferExpiryMonitor.unwatch(transfer.id)
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
 * @apiExample {shell} Basic Transfer:
 *    curl -x PUT -H "Content-Type: application/json" -d
 *    '{
 *      "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example/USD",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/alice",
 *        "amount": "50",
 *        "authorized": true
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": {
 *        "message_hash": "claZQU7qkFz7smkAVtQp9ekUCc5LgoeN9W3RItIzykNEDbGSvzeHvOk9v/vrPpm+XWx5VFjd/sVbM2SLnCpxLw==",
 *        "signer": "http://ledger.example",
 *        "type": "ed25519-sha512",
 *        "public_key": "Lvf3YtnHLMER+VHT0aaeEJF+7WQcvp4iKZAdvMVto7c="
 *      },
 *      "execution_condition_fulfillment": {
 *        "type": "ed25519-sha512",
 *        "signature": "sd0RahwuJJgeNfg8HvWHtYf4uqNgCOqIbseERacqs8G0kXNQQnhfV6gWAnMb+0RIlY3e0mqbrQiUwbRYJvRBAw=="
 *      },
 *      "expires_at": "2015-06-16T00:00:01.000Z"
 *    }'
 *    https://trader.example/payments/c9377529-d7df-4aa1-ae37-ad5148612003
 *
 * @apiSuccessExample {json} 201 New Transfer Response:
 *    HTTP/1.1 201 CREATED
 *    {
 *      "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example/USD",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/alice",
 *        "amount": "50",
 *        "authorized": true
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": {
 *        "message_hash": "claZQU7qkFz7smkAVtQp9ekUCc5LgoeN9W3RItIzykNEDbGSvzeHvOk9v/vrPpm+XWx5VFjd/sVbM2SLnCpxLw==",
 *        "signer": "http://ledger.example",
 *        "type": "ed25519-sha512",
 *        "public_key": "Lvf3YtnHLMER+VHT0aaeEJF+7WQcvp4iKZAdvMVto7c="
 *      },
 *      "execution_condition_fulfillment": {
 *        "type": "ed25519-sha512",
 *        "signature": "sd0RahwuJJgeNfg8HvWHtYf4uqNgCOqIbseERacqs8G0kXNQQnhfV6gWAnMb+0RIlY3e0mqbrQiUwbRYJvRBAw=="
 *      },
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "executed"
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
exports.putResource = function * create () {
  const _this = this

  let id = _this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  let transfer = this.body

  // Do not allow modifications after the expires_at date
  transferExpiryMonitor.validateNotExpired(transfer)

  if (typeof transfer.id !== 'undefined') {
    transfer.id = transfer.id.toLowerCase()
    requestUtil.assert.strictEqual(
      transfer.id,
      id,
      'Transfer ID must match the URI'
    )
  }

  if (typeof transfer.ledger !== 'undefined') {
    requestUtil.assert.strictEqual(
      transfer.ledger,
      config.server.base_uri,
      'Transfer contains incorrect ledger URI'
    )
  }

  requestUtil.assert.strictEqual(
    transfer.type,
    undefined,
    'Transfer contains incorrect type')

  transfer.id = id
  transfer.ledger = config.server.base_uri

  log.debug('putting transfer ID ' + transfer.id)
  log.debug('' + transfer.debits[0].account + ' -> ' +
    transfer.credits[0].account + ' : ' +
    transfer.credits[0].amount)

  // Do all static verification (signatures, validity, etc.) here

  // Verify debits
  let totalDebits = 0
  let totalCredits = 0

  transfer.debits.forEach(function (debit) {
    if (debit.amount <= 0) {
      throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.')
    }
    totalDebits += parseFloat(debit.amount)
  })

  transfer.credits.forEach(function (credit) {
    if (credit.amount <= 0) {
      throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.')
    }
    totalCredits += parseFloat(credit.amount)
  })

  if (totalCredits !== totalDebits) {
    throw new UnprocessableEntityError(
      'Total credits must equal total debits')
  }

  // TODO Validate that the execution_condition_fulfillment is correct

  let originalTransfer, previousDebits
  yield db.transaction(function *(transaction) {
    originalTransfer = yield Transfer.findById(transfer.id, {transaction})
    if (originalTransfer) {
      log.debug('found an existing transfer with this ID')
      previousDebits = originalTransfer.getData().debits

      // This method will update the original transfer object using the new
      // version, but only allowing specific fields to change.
      transfer = updateTransferObject(originalTransfer, transfer)
    } else {
      // If any accounts involved in a new transfer are disabled, throw error
      yield hasDisabledAccounts(transaction, transfer)
      // A brand-new transfer will start out as proposed
      updateState(transfer, 'proposed')
    }

    // This method will check that any authorized:true fields added can
    // only be added by the owner of the account
    // _this.req.user is set by the passport middleware
    let user = _this.req.user
    validateAuthorizations(user && user.name, transfer, previousDebits)

    yield processStateTransitions(transaction, transfer)

    // Store transfer in database
    if (originalTransfer) {
      yield transfer.save({transaction})
    } else {
      yield Transfer.create(transfer, {transaction})
    }

    // Create persistent notification events. We're doing this within the same
    // database transaction in order to maximize the reliability of the
    // notification system. If the server crashes while trying to post a
    // notification it should retry it when it comes back.
    yield notificationWorker.queueNotifications(transfer, transaction)

    // Start the expiry countdown if the transfer is not yet finalized
    // If the expires_at has passed by this time we'll consider
    // the transfer to have made it in before the deadline
    if (!transfer.isFinalized()) {
      yield transferExpiryMonitor.watch(transfer)
    }
  })

  log.debug('changes written to database')

  this.body = transfer.getDataExternal()
  this.status = originalTransfer ? 200 : 201

  // Process notifications soon
  notificationWorker.scheduleProcessing()
}
