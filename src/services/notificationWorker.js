'use strict'

const NotificationWorker = require('../lib/notificationWorker')
const uri = require('./uriManager')
const log = require('./log')
const Notification = require('../models/notification').Notification
const Transfer = require('../models/transfer').Transfer
const Subscription = require('../models/subscription').Subscription

module.exports = new NotificationWorker(uri, log('notificationWorker'), Notification, Transfer, Subscription)
