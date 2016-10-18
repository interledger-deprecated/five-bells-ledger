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

  const recipientName = uri.parse(message.account, 'account').name.toLowerCase()
  const senderAccount = uri.make('account', requestingUser.name)
  yield notificationBroadcaster.sendMessage(recipientName, {
    ledger: message.ledger,
    account: senderAccount,
    data: message.data
  })
}

module.exports = { sendMessage }
