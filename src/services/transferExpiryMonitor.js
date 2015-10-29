'use strict'

const TransferExpiryMonitor =
  require('../lib/transferExpiryMonitor').TransferExpiryMonitor
const timeQueue = require('./timeQueue')
const notificationWorker = require('./notificationWorker')

module.exports = new TransferExpiryMonitor(timeQueue, notificationWorker)
