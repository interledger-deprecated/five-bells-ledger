'use strict'

const crypto = require('crypto')
const _ = require('lodash')
const diff = require('deep-diff')
const tweetnacl = require('tweetnacl')
const stringifyJSON = require('canonical-json')
const db = require('./db/transfers')
const fulfillments = require('./db/conditionFulfillments')
const makeAccountBalances = require('../lib/accountBalances')
const validateNoDisabledAccounts = require('../lib/disabledAccounts')
const config = require('../services/config')
const uri = require('../services/uriManager')
const transferExpiryMonitor = require('../services/transferExpiryMonitor')
const notificationWorker = require('../services/notificationWorker')
const log = require('../services/log')('transfers')
const updateState = require('../lib/updateState')
const hashJSON = require('five-bells-shared/utils/hashJson')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const UnmetConditionError = require('five-bells-shared/errors/unmet-condition-error')
const InvalidModificationError =
require('five-bells-shared/errors/invalid-modification-error')
const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')
const UnauthorizedError =
require('five-bells-shared/errors/unauthorized-error')
const Condition = require('five-bells-condition').Condition

const validExecutionStates = ['prepared']
const validCancellationStates = ['prepared', 'proposed']

function * getTransfer (id) {
  log.debug('fetching transfer ID ' + id)

  let transfer = yield db.getTransfer(id)
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID')
  }

  return transfer.getDataExternal()
}

function * getTransferStateReceipt (id, signatureType, conditionState) {
  log.debug('fetching state receipt for transfer ID ' + id)
  const transfer = yield db.getTransfer(id)
  const transferState = transfer ? transfer.state : 'nonexistent'
  const message = {
    id: uri.make('transfer', id),
    state: transferState
  }
  const transferStateReceipt = {
    type: signatureType,
    message: message,
    signer: config.getIn(['server', 'base_uri'])
  }

  if (signatureType === 'ed25519-sha512') {
    transferStateReceipt.public_key = config.getIn(['keys', 'ed25519', 'public'])
    transferStateReceipt.signature = sign(hashJSON(message))
  } else if (signatureType === 'sha256') {
    const realPreImage = makePreImage(message.id, transferState)
    transferStateReceipt.digest = sha256(stringifyJSON(realPreImage))
    transferStateReceipt.message = makePreImage(message.id, transferState)
    if (conditionState) {
      const conditionPreImage = makePreImage(message.id, conditionState)
      transferStateReceipt.condition_state = conditionState
      transferStateReceipt.condition_digest = sha256(stringifyJSON(conditionPreImage))
    }
  } else {
    throw new UnprocessableEntityError('type is not valid')
  }

  return transferStateReceipt
}

function getPublicKey () {
  return {
    public_key: config.getIn(['keys', 'ed25519', 'public'])
  }
}

function * getPreimage (transferId, state) {
  if (!state) {
    const transfer = yield db.getTransfer(transferId)
    state = transfer ? transfer.state : 'nonexistent'
  }
  const conditionPreImage = makePreImage(transferId, state)
  return {
    condition_state: state,
    condition_digest: sha256(stringifyJSON(conditionPreImage))
  }
}

function makePreImage (transfer_id, state) {
  return {
    id: transfer_id,
    state: state,
    token: sign(sha512(transfer_id + ':' + state))
  }
}

function sign (base64Str) {
  return tweetnacl.util.encodeBase64(
    tweetnacl.sign.detached(
      tweetnacl.util.decodeBase64(base64Str),
      tweetnacl.util.decodeBase64(config.getIn(['keys', 'ed25519', 'secret']))))
}

function sha256 (str) {
  return crypto.createHash('sha256').update(str).digest('base64')
}

function sha512 (str) {
  return crypto.createHash('sha512').update(str).digest('base64')
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

function isAffectedAccount (account, transfer) {
  return _.includes(_.pluck(transfer.debits, 'account'), account) ||
      _.includes(_.pluck(transfer.credits, 'account'), account)
}

function validateIsAffectedAccount (account, transfer) {
  if (account && !isAffectedAccount(account, transfer)) {
    throw new UnauthorizedError('Unknown or invalid account / password')
  }
}

function validateAuthorizations (authorizedAccount, transfer, previousDebits) {
  if (previousDebits && transfer.debits.length !== previousDebits.length) {
    throw new UnprocessableEntityError('Invalid change in number of debits')
  }
  transfer.debits.forEach((debit, i) => {
    const previousAuthorization = previousDebits
      ? previousDebits[i].authorized : false
    if (debit.authorized && debit.authorized !== previousAuthorization &&
        debit.account !== authorizedAccount) {
      throw new UnauthorizedError('Invalid attempt to authorize debit')
    }
  })
  // TODO: add credit authorization
}

function validatePositiveAmounts (adjustments) {
  if (_.some(adjustments, adjustment => parseFloat(adjustment.amount) <= 0)) {
    throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.')
  }
}

function validateCreditAndDebitAmounts (transfer) {
  validatePositiveAmounts(transfer.debits)
  validatePositiveAmounts(transfer.credits)

  const totalDebits = _.sum(_.map(transfer.debits, 'amount'))
  const totalCredits = _.sum(_.map(transfer.credits, 'amount'))

  if (totalCredits !== totalDebits) {
    throw new UnprocessableEntityError('Total credits must equal total debits')
  }
}

function isAuthorized (transfer) {
  return _.every(transfer.debits, debit => debit.authorized)
}

function * processTransitionToPreparedState (transfer, accountBalances) {
  if (transfer.state === 'proposed' && isAuthorized(transfer)) {
    yield accountBalances.applyDebits()  // hold sender funds
    updateState(transfer, 'prepared')
  }
}

function * processImmediateExecution (transfer, accountBalances) {
  if (transfer.state === 'prepared' &&
      transfer.execution_condition === undefined) {
    yield accountBalances.applyCredits()  // release held funds to recipient
    transferExpiryMonitor.unwatch(transfer.id)
    updateState(transfer, 'executed')
  }
}

function validateConditionFulfillment (transfer, fulfillment) {
  // We don't know if notary is executing or rejecting transfer
  const type = _.get(fulfillment.getData(), 'condition_fulfillment.type')

  const isValidExecution = Boolean(transfer.execution_condition &&
    transfer.execution_condition.type === type &&
    Condition.testFulfillment(transfer.execution_condition,
      fulfillment.getData().condition_fulfillment))

  const isValidCancellation = Boolean(transfer.cancellation_condition &&
    transfer.cancellation_condition.type === type &&
    Condition.testFulfillment(transfer.cancellation_condition,
      fulfillment.getData().condition_fulfillment))

  if (isValidCancellation === isValidExecution) {
    throw new UnmetConditionError('ConditionFulfillment failed')
  }

  return isValidExecution   // true for execution, false for cancellation
}

function * cancelTransfer (transaction, transfer, fulfillment) {
  const accountBalances = yield makeAccountBalances(transaction, transfer)
  if (transfer.state === 'prepared') {
    yield accountBalances.revertDebits()
  }
  yield fulfillments.upsertFulfillment(
    fulfillment, {transaction})
  transfer.rejection_reason = 'cancelled'
  updateState(transfer, 'rejected')
}

function * executeTransfer (transaction, transfer, fulfillment) {
  const accountBalances = yield makeAccountBalances(transaction, transfer)
  yield accountBalances.applyCredits()
  updateState(transfer, 'executed')
  yield fulfillments.upsertFulfillment(
    fulfillment, {transaction})
}

function * fulfillTransfer (transferId, fulfillment) {
  const existingFulfillment = yield db.transaction(function *(transaction) {
    const transfer = yield db.getTransfer(transferId, {transaction})

    if (!transfer) {
      throw new NotFoundError('Invalid transfer ID')
    }

    const isExecution = validateConditionFulfillment(transfer, fulfillment)

    if (isExecution && transfer.state === 'executed' || !isExecution && transfer.state === 'rejected') {
      return (yield fulfillments.getFulfillment(transferId)).getDataExternal()
    }

    if (isExecution) {
      if (!_.includes(validExecutionStates, transfer.state)) {
        throw new InvalidModificationError('Transfers in state ' +
          transfer.state + ' may not be executed')
      }
      yield executeTransfer(transaction, transfer, fulfillment)
    } else {  // cancellation
      if (!_.includes(validCancellationStates, transfer.state)) {
        throw new InvalidModificationError('Transfers in state ' +
          transfer.state + ' may not be cancelled')
      }
      yield cancelTransfer(transaction, transfer, fulfillment)
    }

    transferExpiryMonitor.unwatch(transfer.id)
    yield transfer.save({transaction})

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

  notificationWorker.scheduleProcessing()

  return {
    fulfillment: existingFulfillment || fulfillment.getDataExternal(),
    existed: Boolean(existingFulfillment)
  }
}

function * setTransfer (transfer, requestingUser) {
  // Do not allow modifications after the expires_at date
  transferExpiryMonitor.validateNotExpired(transfer)

  if (typeof transfer.ledger !== 'undefined') {
    if (transfer.ledger !== config.getIn(['server', 'base_uri'])) {
      throw new InvalidBodyError('Transfer contains incorrect ledger URI')
    }
  }

  if (transfer.type !== undefined) {
    throw new InvalidBodyError('Transfer contains incorrect type')
  }

  transfer.ledger = config.getIn(['server', 'base_uri'])

  log.debug('putting transfer ID ' + transfer.id)
  log.debug('' + transfer.debits[0].account + ' -> ' +
    transfer.credits[0].account + ' : ' +
    transfer.credits[0].amount)

  validateCreditAndDebitAmounts(transfer)

  let originalTransfer, previousDebits
  yield db.transaction(function * (transaction) {
    originalTransfer = yield db.getTransfer(transfer.id, {transaction})
    if (originalTransfer) {
      log.debug('found an existing transfer with this ID')
      previousDebits = originalTransfer.getData().debits

      // This method will update the original transfer object using the new
      // version, but only allowing specific fields to change.
      transfer = updateTransferObject(originalTransfer, transfer)
    } else {
      yield validateNoDisabledAccounts(transaction, transfer)
      // A brand-new transfer will start out as proposed
      updateState(transfer, 'proposed')
    }

    const requestingUsername = requestingUser && requestingUser.name
    validateIsAffectedAccount(requestingUsername, transfer)
    // This method will check that any authorized:true fields added can
    // only be added by the owner of the account
    validateAuthorizations(requestingUsername, transfer, previousDebits)

    const accountBalances = yield makeAccountBalances(transaction, transfer)
    yield processTransitionToPreparedState(transfer, accountBalances)
    yield processImmediateExecution(transfer, accountBalances)

    yield db.upsertTransfer(transfer, {transaction})

    // Create persistent notification events. We're doing this within the same
    // database transaction in order to maximize the reliability of the
    // notification system. If the server crashes while trying to post a
    // notification it should retry it when it comes back.
    yield notificationWorker.queueNotifications(transfer, transaction)
  })

  // Start the expiry countdown if the transfer is not yet finalized
  // If the expires_at has passed by this time we'll consider
  // the transfer to have made it in before the deadline
  if (!transfer.isFinalized()) {
    yield transferExpiryMonitor.watch(transfer)
  }

  log.debug('changes written to database')

  // Process notifications soon
  notificationWorker.scheduleProcessing()

  return {
    transfer: transfer.getDataExternal(),
    existed: Boolean(originalTransfer)
  }
}

function * getFulfillment (transferId) {
  const fulfillment = yield fulfillments.getFulfillment(transferId)
  if (!fulfillment) {
    throw new NotFoundError('This transfer has no fulfillment')
  }
  return fulfillment.getDataExternal()
}

module.exports = {
  getTransfer,
  getTransferStateReceipt,
  setTransfer,
  fulfillTransfer,
  getFulfillment,
  getPublicKey,
  getPreimage
}
