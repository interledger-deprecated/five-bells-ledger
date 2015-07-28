/* @flow */
'use strict'

const _ = require('lodash')
const diff = require('deep-diff')
const tweetnacl = require('tweetnacl')
const db = require('../services/db')
const accountBalances = require('../lib/accountBalances')
const config = require('../services/config')
const uri = require('../services/uriManager')
const transferExpiryMonitor = require('../services/transferExpiryMonitor')
const log = require('../services/log')('transfers')
const request = require('co-request')
const requestUtil = require('@ripple/five-bells-shared/utils/request')
const verifyCondition = require('@ripple/five-bells-shared/utils/verifyCondition')
const updateState = require('../lib/updateState')
const jsonld = require('@ripple/five-bells-shared/utils/jsonld')
const hashJSON = require('@ripple/five-bells-shared/utils/hashJson')
const Transfer = require('../models/transfer').Transfer
const NotFoundError = require('@ripple/five-bells-shared/errors/not-found-error')
const InvalidModificationError =
  require('@ripple/five-bells-shared/errors/invalid-modification-error')
const UnprocessableEntityError =
  require('@ripple/five-bells-shared/errors/unprocessable-entity-error')
const UnauthorizedError =
  require('@ripple/five-bells-shared/errors/unauthorized-error')

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
exports.fetch = function * fetch () {
  let id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  log.debug('fetching transfer ID ' + id)

  let transfer = yield db.get(['transfers', id])
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID')
  }

  jsonld.setContext(this, 'transfer.jsonld')

  // Externally we want to use a full URI ID
  transfer.id = uri.make('transfer', transfer.id)

  this.body = transfer
}

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
 * @returns {void}
 */
exports.getState = function * getState () {
  let id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  id = id.toLowerCase()
  log.debug('fetching state receipt for transfer ID ' + id)

  let transfer = yield db.get(['transfers', id])
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID')
  }

  let message = {
    id: uri.make('transfer', transfer.id),
    state: transfer.state
  }
  let messageHash = hashJSON(message)
  let signature = tweetnacl.util.encodeBase64(
    tweetnacl.sign.detached(
      tweetnacl.util.decodeBase64(messageHash),
      tweetnacl.util.decodeBase64(config.keys.ed25519.secret)))

  let transferStateReceipt = {
    message: message,
    algorithm: 'ed25519-sha512',
    signer: config.server.base_uri,
    public_key: config.keys.ed25519.public,
    signature: signature
  }

  this.body = transferStateReceipt
}

function updateTransferObject (originalTransfer, transfer) {
  let updatedTransfer = originalTransfer.clone()

  // Ignore internally managed properties
  transfer.state = updatedTransfer.state
  transfer.timeline = updatedTransfer.timeline

  // Clients can add authorizations
  // The validity of these authorizations will be checked
  // in the validateAuthorizations function
  _.forEach(updatedTransfer.debits, function (funds, i) {
    if (!funds.authorized &&
      transfer.debits[i].authorized) {
      funds.authorized = true
    }
  })
  _.forEach(updatedTransfer.credits, function (funds, i) {
    if (!funds.authorized &&
      transfer.credits[i].authorized) {
      funds.authorized = true
    }
  })

  // Clients may fulfill the execution condition
  if (transfer.execution_condition_fulfillment) {
    updatedTransfer.execution_condition_fulfillment =
      transfer.execution_condition_fulfillment
  }

  // The old and new objects should now be exactly equal
  if (!_.isEqual(updatedTransfer, transfer)) {
    // If they aren't, this means the user tried to update something they're not
    // supposed to be able to modify.
    // TODO InvalidTransformationError
    throw new InvalidModificationError(
      'Transfer may not be modified in this way',
      diff(updatedTransfer, transfer))
  }

  return updatedTransfer
}

function * processSubscriptions (transfer) {
  // TODO Get subscriptions for affected accounts only
  // TODO Get subscriptions for specific events only
  // const affectedAccounts = _([debitAccounts, creditAccounts])
  //   .map(_.keys).flatten().value()
  //
  // function getSubscriptions(account) {
  //   return db.get(['accounts', account, 'subscriptions'])
  // }
  // let subscriptions = (yield affectedAccounts.map(getSubscriptions))
  let externalTransfer = _.clone(transfer)
  externalTransfer.id = uri.make('transfer', transfer.id)
  let subscriptions = yield db.get(['subscriptions'])

  if (subscriptions) {
    subscriptions = _.values(subscriptions)

    const notifications = subscriptions.map(function (subscription) {
      log.debug('notifying ' + subscription.owner + ' at ' +
        subscription.target)

      return request(subscription.target, {
        method: 'post',
        json: true,
        body: {
          id: uri.make('subscription', subscription.id),
          event: 'transfer.update',
          resource: externalTransfer
        }
      })
    })

    for (let result of yield notifications) {
      if (result.statusCode >= 400) {
        log.debug('remote error for notification ' + result.statusCode,
          result.body)
      }
    }
  }
}

function validateAuthorizations (authorizedAccount, transfer, transferFromDb) {
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
      (!transferFromDb || !transferFromDb.debits[debitIndex].authorized)) {
      throw new UnauthorizedError('Invalid attempt to authorize debit')
    }
  })

// TODO: add credit authorization
}

function * processStateTransitions (tr, transfer) {
  // Calculate per-account totals
  let debitAccounts = yield accountBalances.calculate(tr, transfer.debits)
  let creditAccounts = yield accountBalances.calculate(tr, transfer.credits)

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
      updateState(transfer, 'pre_prepared')
    }
  }

  if (transfer.state === 'pre_prepared') {
    // Hold sender funds
    yield accountBalances.applyDebits(tr, debitAccounts)

    updateState(transfer, 'prepared')
  }

  if (transfer.state === 'prepared') {
    if (transfer.execution_condition &&
      transfer.execution_condition_fulfillment) {
      // This will throw an error if the fulfillment is invalid
      verifyCondition(transfer.execution_condition,
        transfer.execution_condition_fulfillment)
      updateState(transfer, 'pre_executed')

    } else if (!transfer.execution_condition) {
      updateState(transfer, 'pre_executed')
    }
  }

  if (transfer.state === 'pre_executed') {
    // In a real-world / asynchronous implementation, the response from the
    // external ledger would trigger the state transition from 'pre_executed' to
    // 'executed' or 'failed'.
    yield accountBalances.applyCredits(tr, creditAccounts)
    updateState(transfer, 'executed')

    // Remove the expiry countdown
    transferExpiryMonitor.unwatch(transfer.id)
  }

  yield processSubscriptions(transfer)
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
exports.create = function * create () {
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

  transfer.id = id

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

  let originalTransfer
  yield db.transaction(function *(tr) {
    originalTransfer = Transfer.fromDataRaw(yield tr.get(['transfers', transfer.id]))
    if (originalTransfer) {
      log.debug('found an existing transfer with this ID')

      // This method will update the original transfer object using the new
      // version, but only allowing specific fields to change.
      transfer = updateTransferObject(originalTransfer, transfer)
    } else {
      updateState(transfer, 'proposed')
    }

    // This method will check that any authorized:true fields added can
    // only be added by the owner of the account
    // _this.req.user is set by the passport middleware
    validateAuthorizations(_this.req.user, transfer, originalTransfer)

    yield processStateTransitions(tr, transfer)

    // Store transfer in database
    tr.put(['transfers', transfer.id], transfer)

    // Start the expiry countdown
    // If the expires_at has passed by this time we'll consider
    // the transfer to have made it in before the deadline
    yield transferExpiryMonitor.watch(transfer)
  })

  log.debug('changes written to database')

  // Externally we want to use a full URI ID
  transfer.id = uri.make('transfer', id)

  this.body = transfer
  this.status = originalTransfer ? 200 : 201
}
