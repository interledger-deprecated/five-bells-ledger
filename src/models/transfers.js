'use strict'

const Bignumber = require('bignumber.js')
const crypto = require('crypto')
const _ = require('lodash')
const co = require('co')
const promiseRetry = require('promise-retry')
const diff = require('deep-diff')
const tweetnacl = require('tweetnacl')
const stringifyJSON = require('canonical-json')
const db = require('./db/transfers')
const convertToInternalFulfillment = require('./converters/fulfillments')
  .convertToInternalFulfillment
const convertToExternalFulfillment = require('./converters/fulfillments')
  .convertToExternalFulfillment
const fulfillments = require('./db/fulfillments')
const holds = require('../lib/holds')
const validateNoDisabledAccounts = require('../lib/disabledAccounts')
const config = require('../services/config')
const uri = require('../services/uriManager')
const transferExpiryMonitor = require('../services/transferExpiryMonitor')
const notificationBroadcaster = require('../services/notificationBroadcaster')
const log = require('../services/log').create('transfers')
const updateState = require('../lib/updateState')
const hashJSON = require('five-bells-shared/utils/hashJson')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const UnmetConditionError = require('five-bells-shared/errors/unmet-condition-error')
const TransferNotConditionalError = require('five-bells-shared/errors/transfer-not-conditional-error')
const InvalidModificationError =
require('five-bells-shared/errors/invalid-modification-error')
const UnprocessableEntityError =
require('five-bells-shared/errors/unprocessable-entity-error')
const UnauthorizedError =
require('five-bells-shared/errors/unauthorized-error')
const cc = require('five-bells-condition')
const transferDictionary = require('five-bells-shared').TransferStateDictionary

const transferStates = transferDictionary.transferStates
const validExecutionStates = transferDictionary.validExecutionStates
const validCancellationStates = transferDictionary.validCancellationStates
const validator = require('../services/validator')
const converters = require('./converters/transfers')
const isTransferFinalized = require('../lib/transferUtils').isTransferFinalized

const RECEIPT_TYPE_ED25519 = 'ed25519-sha512'
const RECEIPT_TYPE_SHA256 = 'sha256'

const CONDITION_TYPE_EXECUTION = 'execution'
const CONDITION_TYPE_CANCELLATION = 'cancellation'

function * getTransfer (id) {
  log.debug('fetching transfer ID ' + id)

  const transfer = yield db.getTransfer(id)
  if (!transfer) {
    throw new NotFoundError('Unknown transfer ID')
  }

  return converters.convertToExternalTransfer(transfer)
}

function * getTransferStateReceipt (id, receiptType, conditionState) {
  log.debug('fetching state receipt for transfer ID ' + id)
  const transfer = yield db.getTransfer(id)
  const transferState = transfer ? transfer.state : transferStates.TRANSFER_STATE_NONEXISTENT

  if (receiptType === RECEIPT_TYPE_ED25519) {
    return makeEd25519Receipt(uri.make('transfer', id), transferState)
  } else if (receiptType === RECEIPT_TYPE_SHA256) {
    return makeSha256Receipt(uri.make('transfer', id), transferState, conditionState)
  } else {
    throw new UnprocessableEntityError('type is not valid')
  }
}

function makeEd25519Receipt (transferId, transferState) {
  const message = makeTransferStateMessage(transferId, transferState, RECEIPT_TYPE_ED25519)
  return {
    type: RECEIPT_TYPE_ED25519,
    message: message,
    signer: config.getIn(['server', 'base_uri']),
    public_key: config.getIn(['keys', 'ed25519', 'public']),
    signature: sign(hashJSON(message))
  }
}

function makeSha256Receipt (transferId, transferState, conditionState) {
  const message = makeTransferStateMessage(transferId, transferState, RECEIPT_TYPE_SHA256)
  const receipt = {
    type: RECEIPT_TYPE_SHA256,
    message: message,
    signer: config.getIn(['server', 'base_uri']),
    digest: sha256(stringifyJSON(message))
  }
  if (conditionState) {
    const conditionMessage = makeTransferStateMessage(transferId, conditionState, RECEIPT_TYPE_SHA256)
    receipt.condition_state = conditionState
    receipt.condition_digest = sha256(stringifyJSON(conditionMessage))
  }
  return receipt
}

function makeTransferStateMessage (transferId, state, receiptType) {
  const message = {
    id: transferId,
    state: state
  }
  if (receiptType === RECEIPT_TYPE_SHA256) {
    message.token = sign(sha512(transferId + ':' + state))
  }
  return message
}

function sign (base64Str) {
  const seed = new Buffer(config.getIn(['keys', 'ed25519', 'secret']), 'base64')
  const keyPair = tweetnacl.sign.keyPair.fromSeed(seed)
  return new Buffer(
    tweetnacl.sign.detached(
      new Buffer(base64Str, 'base64'),
      keyPair.secretKey
    )
  ).toString('base64')
}

function sha256 (str) {
  return crypto.createHash('sha256').update(str).digest('base64')
}

function sha512 (str) {
  return crypto.createHash('sha512').update(str).digest('base64')
}

function updateTransferObject (originalTransfer, transfer) {
  let updatedTransferData = _.cloneDeep(originalTransfer)

  // Ignore null properties
  updatedTransferData = _.omitBy(updatedTransferData, _.isNull)

  // Ignore internally managed properties
  transfer.state = updatedTransferData.state
  transfer.created_at = updatedTransferData.created_at
  transfer.updated_at = updatedTransferData.updated_at
  transfer.proposed_at = updatedTransferData.proposed_at
  transfer.prepared_at = updatedTransferData.prepared_at
  transfer.executed_at = updatedTransferData.executed_at
  transfer.rejected_at = updatedTransferData.rejected_at

  // Ignore undefined properties
  const transferData = _.omitBy(transfer, _.isUndefined)

  // Clients can add authorizations
  // The validity of these authorizations will be checked
  // in the validateAuthorizationsAndRejections function
  _.forEach(updatedTransferData.debits, function (funds, i) {
    if (!funds.authorized &&
      transfer.debits[i] &&
      transfer.debits[i].authorized) {
      funds.authorized = true
    }
  })
  _.forEach(updatedTransferData.credits, function (funds, i) {
    if (!funds.rejected &&
      transfer.credits[i] &&
      transfer.credits[i].rejected) {
      funds.rejected = true
      funds.rejection_message = transfer.credits[i].rejection_message
    }
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

  return updatedTransferData
}

function isAffectedAccount (account, transfer) {
  return _.includes(_.map(transfer.debits, 'account'), account) ||
      _.includes(_.map(transfer.credits, 'account'), account)
}

function validateIsAffectedAccount (account, transfer) {
  if (account && !isAffectedAccount(account, transfer)) {
    throw new UnauthorizedError('Invalid attempt to authorize debit')
  }
}

/**
 * @param {Account} authorizedAccount
 * @param {Funds} fundsList
 * @param {Funds|undefined} previousFunds
 * @param {String} fundsType "debit" or "credit"
 */
function validateAuthorizationsAndRejections (authorizedAccount, fundsList, previousFunds, fundsType) {
  if (previousFunds && fundsList.length !== previousFunds.length) {
    throw new UnprocessableEntityError('Invalid change in number of ' + fundsType + 's')
  }
  fundsList.forEach((funds, i) => {
    const previousAuthorization = previousFunds && previousFunds[i].authorized
    if (funds.authorized && funds.authorized !== previousAuthorization &&
        funds.account !== authorizedAccount) {
      throw new UnauthorizedError('Invalid attempt to authorize ' + fundsType)
    }

    const previousRejection = previousFunds && previousFunds[i].rejected
    if (funds.rejected && funds.rejected !== previousRejection &&
        funds.account !== authorizedAccount) {
      throw new UnauthorizedError('Invalid attempt to reject ' + fundsType)
    }
  })
}

function validatePositiveAmounts (adjustments) {
  if (_.some(adjustments, (adjustment) => parseFloat(adjustment.amount) <= 0)) {
    throw new UnprocessableEntityError(
        'Amount must be a positive number excluding zero.')
  }
}

function validatePrecisionAmounts (adjustments) {
  const allowedPrecision = config.get('amount.precision')
  const allowedScale = config.get('amount.scale')

  const invalid = _.some(adjustments, (adjustment) => {
    const amount = new Bignumber(adjustment.amount)
    return (amount.decimalPlaces() > allowedScale) ||
      (amount.precision() > allowedPrecision)
  })

  if (invalid) {
    throw new UnprocessableEntityError(
        'Amount exceeds allowed precision scale=' + allowedScale + ' precision=' + allowedPrecision)
  }
}

function validateCreditAndDebitAmounts (transfer) {
  validatePositiveAmounts(transfer.debits)
  validatePositiveAmounts(transfer.credits)

  validatePrecisionAmounts(transfer.debits)
  validatePrecisionAmounts(transfer.credits)

  const sumAmounts = (crebits) => {
    return crebits
      .map(crebit => new Bignumber(crebit.amount))
      .reduce((a, b) => a.add(b), new Bignumber(0))
      .toString()
  }

  const totalDebits = sumAmounts(transfer.debits)
  const totalCredits = sumAmounts(transfer.credits)

  if (totalCredits !== totalDebits) {
    throw new UnprocessableEntityError('Total credits must equal total debits')
  }
}

/**
 * Normalize the amounts.
 * Because an amount of "1.0" is saved as "1", updating the transfer with "1.0"
 * would cause an InvalidModificationError unless the amounts are normalized.
 */
function normalizeCreditAndDebitAmounts (transfer) {
  transfer.debits.forEach((debit) => {
    debit.amount = new Bignumber(debit.amount).toString()
  })
  transfer.credits.forEach((credit) => {
    credit.amount = new Bignumber(credit.amount).toString()
  })
}

function isAuthorized (transfer) {
  const areDebitsAuthorized = _.every(transfer.debits, 'authorized')
  if (config.getIn(['features', 'hasCreditAuth'])) {
    return areDebitsAuthorized && _.every(transfer.credits, 'authorized')
  }
  return areDebitsAuthorized
}

function * processTransitionToPreparedState (transfer, transaction) {
  if (transfer.state === transferStates.TRANSFER_STATE_PROPOSED && isAuthorized(transfer)) {
    yield holds.holdFunds(transfer, transaction)  // hold sender funds
    updateState(transfer, transferStates.TRANSFER_STATE_PREPARED)
  }
}

function * processImmediateExecution (transfer, transaction) {
  if (transfer.state === transferStates.TRANSFER_STATE_PREPARED &&
      transfer.execution_condition === undefined) {
    // release held funds to recipient
    yield holds.disburseFunds(transfer, transaction)
    transferExpiryMonitor.unwatch(transfer.id)
    updateState(transfer, transferStates.TRANSFER_STATE_EXECUTED)
  }
}

function * processCreditRejection (transfer, transaction) {
  if (transfer.state === transferStates.TRANSFER_STATE_REJECTED) return
  const hasRejectedCredit = _.some(transfer.credits, 'rejected')
  if (!hasRejectedCredit) return

  if (!_.includes(validCancellationStates, transfer.state)) {
    throw new InvalidModificationError('Transfers in state ' +
      transfer.state + ' may not be rejected')
  }

  if (transfer.state === transferStates.TRANSFER_STATE_PREPARED) {
    yield holds.returnHeldFunds(transfer, transaction)
  }
  transfer.rejection_reason = 'cancelled'
  updateState(transfer, transferStates.TRANSFER_STATE_REJECTED)
}

function validateConditionFulfillment (transfer, fulfillmentModel) {
  if (!transfer.execution_condition && !transfer.cancellation_condition) {
    throw new TransferNotConditionalError('Transfer is not conditional')
  }

  const fulfillment = convertToExternalFulfillment(fulfillmentModel)
  try {
    const condition = cc.fulfillmentToCondition(fulfillment)
    if (
      condition === transfer.execution_condition &&
      cc.validateFulfillment(fulfillment, condition)
    ) {
      return CONDITION_TYPE_EXECUTION
    } else if (
      condition === transfer.cancellation_condition &&
      cc.validateFulfillment(fulfillment, condition)
    ) {
      return CONDITION_TYPE_CANCELLATION
    }
  } catch (err) {
    throw new InvalidBodyError('Invalid fulfillment: ' + err.toString())
  }

  throw new UnmetConditionError('Fulfillment does not match any condition')
}

function * cancelTransfer (transaction, transfer, fulfillment) {
  yield fulfillments.insertFulfillment(fulfillment, {transaction})
  if (transfer.state === transferStates.TRANSFER_STATE_PREPARED) {
    yield holds.returnHeldFunds(transfer, transaction)
  }
  transfer.rejection_reason = 'cancelled'
  updateState(transfer, transferStates.TRANSFER_STATE_REJECTED)
}

function * executeTransfer (transaction, transfer, fulfillment) {
  yield fulfillments.insertFulfillment(fulfillment, {transaction})
  yield holds.disburseFunds(transfer, transaction)
  updateState(transfer, transferStates.TRANSFER_STATE_EXECUTED)
}

function * fulfillTransfer (transferId, fulfillmentUri) {
  const fulfillment = convertToInternalFulfillment(fulfillmentUri)
  fulfillment.transfer_id = transferId
  let transfer = null
  return yield promiseRetry(co.wrap(function * (retry, attemptNo) {
    log.debug('fulfill transfer attempt %d', attemptNo)
    try {
      const existingFulfillment = yield db.withSerializableTransaction(function * (transaction) {
        transfer = yield db.getTransfer(transferId, {transaction})

        if (!transfer) {
          throw new NotFoundError('Invalid transfer ID')
        }

        const conditionType = validateConditionFulfillment(transfer, fulfillment)
        transferExpiryMonitor.validateNotExpired(transfer)

        if (
          conditionType === CONDITION_TYPE_EXECUTION &&
          transfer.state === transferStates.TRANSFER_STATE_EXECUTED ||
          conditionType === CONDITION_TYPE_CANCELLATION &&
          transfer.state === transferStates.TRANSFER_STATE_REJECTED
        ) {
          return convertToExternalFulfillment(yield fulfillments.getFulfillment(
            transferId, {transaction}))
        }

        if (conditionType === CONDITION_TYPE_EXECUTION) {
          if (!_.includes(validExecutionStates, transfer.state)) {
            throw new InvalidModificationError('Transfers in state ' +
            transfer.state + ' may not be executed')
          }
          yield executeTransfer(transaction, transfer, fulfillment)
        } else if (conditionType === CONDITION_TYPE_CANCELLATION) {
          if (!_.includes(validCancellationStates, transfer.state)) {
            throw new InvalidModificationError('Transfers in state ' +
            transfer.state + ' may not be cancelled')
          }
          yield cancelTransfer(transaction, transfer, fulfillment)
        }

        transferExpiryMonitor.unwatch(transfer.id)
        yield db.updateTransfer(transfer, {transaction})

        // Start the expiry countdown if the transfer is not yet finalized
        // If the expires_at has passed by this time we'll consider
        // the transfer to have made it in before the deadline
        if (!isTransferFinalized(transfer)) {
          yield transferExpiryMonitor.watch(transfer)
        }
      })

      log.debug('changes written to database')
      yield notificationBroadcaster.sendNotifications(transfer, null)

      return {
        fulfillment: existingFulfillment || convertToExternalFulfillment(fulfillment),
        existed: Boolean(existingFulfillment)
      }
    } catch (err) {
      // In case of a synchronization error, retry
      if (Number(err.code) === 40001) {
        retry(err)
      } else {
        throw err
      }
    }
  }))
}

function * rejectTransfer (transferId, rejectionMessage, requestingUser) {
  const transfer = yield getTransfer(transferId)
  if (!transfer.execution_condition) {
    throw new TransferNotConditionalError('Transfer is not conditional')
  }

  const requestingAccount = config.server.base_uri + '/accounts/' + requestingUser.name
  // Pick a credit that matches the requestingUser if possible.
  // Picking credits[0] will result in a UnauthorizedError.
  const credit = transfer.credits.find(
    (credit) => credit.account === requestingAccount) || transfer.credits[0]
  const alreadyRejected = credit.rejected

  credit.rejected = true
  credit.rejection_message = (new Buffer(rejectionMessage)).toString('base64')
  delete transfer.timeline
  yield setTransfer(transfer, requestingUser)
  return {
    existed: alreadyRejected,
    rejection: rejectionMessage
  }
}

function * setTransfer (externalTransfer, requestingUser) {
  const validationResult = validator.create('Transfer')(externalTransfer)
  if (validationResult.valid !== true) {
    const message = validationResult.schema
      ? 'Body did not match schema ' + validationResult.schema
      : 'Body did not pass validation'
    throw new InvalidBodyError(message, validationResult.errors)
  }
  let transfer = converters.convertToInternalTransfer(externalTransfer)

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
  normalizeCreditAndDebitAmounts(transfer)

  let originalTransfer, previousDebits, previousCredits
  yield db.withSerializableTransaction(function * (transaction) {
    originalTransfer = yield db.getTransfer(transfer.id, {transaction})
    if (originalTransfer) {
      log.debug('found an existing transfer with this ID')
      previousDebits = originalTransfer.debits
      previousCredits = originalTransfer.credits

      // This method will update the original transfer object using the new
      // version, but only allowing specific fields to change.
      transfer = updateTransferObject(originalTransfer, transfer)
    } else {
      yield validateNoDisabledAccounts(transaction, transfer)
      // A brand-new transfer will start out as proposed
      updateState(transfer, transferStates.TRANSFER_STATE_PROPOSED)
    }

    if (!(requestingUser && requestingUser.is_admin)) {
      const requestingUsername = requestingUser && requestingUser.name
      validateIsAffectedAccount(requestingUsername, transfer)
      // This method will check that any authorized:true or rejected:true fields
      // added can only be added by the owner of the account
      validateAuthorizationsAndRejections(requestingUsername, transfer.debits,
        previousDebits, 'debit')
      validateAuthorizationsAndRejections(requestingUsername, transfer.credits,
        previousCredits, 'credit')
    }

    // The transfer must be inserted into the database before holds can
    // be placed because the adjustments reference the transfer's primary key
    yield db.upsertTransfer(transfer, {transaction})
    yield processTransitionToPreparedState(transfer, transaction)
    yield processImmediateExecution(transfer, transaction)
    yield processCreditRejection(transfer, transaction)
    yield db.upsertTransfer(transfer, {transaction})
  })

  yield notificationBroadcaster.sendNotifications(transfer, null)

  // Start the expiry countdown if the transfer is not yet finalized
  // If the expires_at has passed by this time we'll consider
  // the transfer to have made it in before the deadline
  if (!isTransferFinalized(transfer)) {
    yield transferExpiryMonitor.watch(transfer)
  }

  log.debug('changes written to database')

  return {
    transfer: converters.convertToExternalTransfer(transfer),
    existed: Boolean(originalTransfer)
  }
}

function * getFulfillment (transferId) {
  const fulfillment = yield fulfillments.getFulfillment(transferId)
  return convertToExternalFulfillment(fulfillment)
}

function * insertTransfers (externalTransfers) {
  yield db.insertTransfers(externalTransfers.map(
    converters.convertToInternalTransfer))
}

module.exports = {
  getTransfer,
  getTransferStateReceipt,
  setTransfer,
  fulfillTransfer,
  rejectTransfer,
  getFulfillment,
  insertTransfers
}
