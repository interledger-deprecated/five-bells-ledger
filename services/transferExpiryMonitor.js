'use strict'

const TransferExpiryMonitor =
  require('../lib/transferExpiryMonitor').TransferExpiryMonitor
const timeQueue = require('./timeQueue')

module.exports = new TransferExpiryMonitor(timeQueue)
