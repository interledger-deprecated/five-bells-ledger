'use strict'

const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const NoSubscriptionsError = require('../errors/no-subscriptions-error')
const uri = require('../services/uriManager')
const validator = require('../services/validator')
const notificationBroadcaster = require('../services/notificationBroadcaster')
const log = require('../services/log').create('messages')

async function sendMessage (message, requestingUser) {
  // const validationResult = validator.create('Message')(message)
  // if (validationResult.valid !== true) {
  //   const error = validationResult.schema
  //     ? 'Body did not match schema ' + validationResult.schema
  //     : 'Body did not pass validation'
  //   throw new InvalidBodyError(error, validationResult.errors)
  // }

  // For backwards compatibility.
  if (message.account && !message.from && !message.to) {
    message.to = message.account
    message.from = uri.make('account', requestingUser.name)
  }

  const senderAccount = message.from
  const senderName = uri.parse(senderAccount, 'account').name.toLowerCase()
  const recipientName = uri.parse(message.to, 'account').name.toLowerCase()

  log.debug('%s -> %s: %o', senderName, recipientName, message.data)

  // Only admin can impersonate users.
  // if (!requestingUser.is_admin && senderName !== requestingUser.name) {
  //   throw new InvalidBodyError('You do not have permission to impersonate this user')
  // }

  const messageDelivered = await notificationBroadcaster.sendMessage(
    recipientName, Object.assign({}, message, {account: senderAccount}))
  if (!messageDelivered) {
    throw new NoSubscriptionsError('Destination account could not be reached')
  }
}

module.exports = { sendMessage }
