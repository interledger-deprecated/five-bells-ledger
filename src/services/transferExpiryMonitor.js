'use strict'

const TransferExpiryMonitor =
  require('../lib/transferExpiryMonitor').TransferExpiryMonitor
const timeQueue = require('./timeQueue')
const notificationBroadcaster = require('./notificationBroadcaster')

module.exports = new TransferExpiryMonitor(timeQueue, notificationBroadcaster)
