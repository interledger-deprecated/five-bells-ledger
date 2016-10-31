'use strict'

const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const uri = require('../services/uriManager')
const validator = require('../services/validator')
const notificationBroadcaster = require('../services/notificationBroadcaster')

function * sendMessage (message, requestingUser) {
  const validationResult = validator.create('Message')(message)
  if (validationResult.valid !== true) {
    const error = validationResult.schema
      ? 'Body did not match schema ' + validationResult.schema
      : 'Body did not pass validation'
    throw new InvalidBodyError(error, validationResult.errors)
  }

  const mode1 = !!message.account
  const mode2 = !!(message.from && message.to)
  if ((mode1 && mode2) || (!mode1 && !mode2)) {
    throw new InvalidBodyError('Expected either message.account OR message.from/to')
  }

  const senderAccount = message.from || uri.make('account', requestingUser.name)
  const senderName = uri.parse(senderAccount, 'account').name.toLowerCase()
  const recipientName = uri.parse(message.to || message.account, 'account').name.toLowerCase()

  // Only admin can impersonate users.
  if (!requestingUser.is_admin && senderName !== requestingUser.name) {
    throw new InvalidBodyError('You do not have permission to impersonate this user')
  }

  yield notificationBroadcaster.sendMessage(recipientName, {
    ledger: message.ledger,
    account: senderAccount,
    data: message.data
  })
}

module.exports = { sendMessage }
