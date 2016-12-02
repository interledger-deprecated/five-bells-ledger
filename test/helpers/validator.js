'use strict'
const _ = require('lodash')
const validator = require('../../src/services/validator')

function validate (schema, json) {
  const validatorResult = validator.create(schema)(json)
  if (!validatorResult.valid) {
    throw new Error(schema + ' schema validation error: ' + JSON.stringify(_.omit(validatorResult.errors[0], ['stack'])))
  }
}

function validateTransfer (res) {
  validate('Transfer', res.body)
}

function validateTransfers (res) {
  res.body.forEach((transfer) => {
    validateTransfer({body: transfer})
  })
}

function validateAccount (res) {
  validate('Account', res.body)
}

function validateAccounts (res) {
  res.body.forEach((account) => {
    validateAccount({body: account})
  })
}

function validateNotification (res) {
  validate('Notification', res.body)
}

function validateFulfillment (res) {
  validate('ConditionFulfillment', res.text)
}

function validateSubscription (res) {
  validate('Subscription', res.body)
}

function validateTransferStateReceipt (res) {
  validate('TransferStateReceipt', res.body)
}

module.exports = {
  validateTransfer,
  validateTransfers,
  validateAccount,
  validateAccounts,
  validateFulfillment,
  validateNotification,
  validateSubscription,
  validateTransferStateReceipt
}
