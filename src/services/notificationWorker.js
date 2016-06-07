'use strict'

const NotificationWorker = require('../lib/notificationWorker')
const uri = require('./uriManager')
const log = require('./log')
const Notification = require('../models/db/notification').Notification
const ConditionFulfillment = require('../models/db/conditionFulfillment').ConditionFulfillment
const config = require('./config')

module.exports = new NotificationWorker(uri, log('notificationWorker'), Notification, ConditionFulfillment, config)
