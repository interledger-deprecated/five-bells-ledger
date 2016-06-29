'use strict'

const NotificationBroadcaster = require('../lib/notificationBroadcasterWebsocket')
const log = require('./log')
const ConditionFulfillment = require('../models/db/conditionFulfillment').ConditionFulfillment
const config = require('./config')

module.exports = new NotificationBroadcaster(log('notificationBroadcaster'), ConditionFulfillment, config)
