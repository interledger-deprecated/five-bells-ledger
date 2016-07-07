'use strict'

const NotificationBroadcaster = require('../lib/notificationBroadcasterWebsocket')
const log = require('./log')

module.exports = new NotificationBroadcaster(log('notificationBroadcaster'))
