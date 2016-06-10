'use strict'

const NotificationWorker = require('../lib/notificationWorker')
const uri = require('./uriManager')
const log = require('./log')
const config = require('./config')

module.exports = new NotificationWorker(uri, log('notificationWorker'), config)
