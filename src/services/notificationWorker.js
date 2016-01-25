'use strict'

const NotificationWorker = require('../lib/notificationWorker')
const uri = require('./uriManager')
const log = require('./log')
const Notification = require('../models/db/notification').Notification
const Transfer = require('../models/db/transfer').Transfer
const Subscription = require('../models/db/subscription').Subscription

module.exports = new NotificationWorker(uri, log('notificationWorker'), Notification, Transfer, Subscription)
