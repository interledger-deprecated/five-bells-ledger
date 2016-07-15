'use strict'

const db = require('../services/db')
const log = require('../services/log').create('remove_subscriptions')

db.remove('subscriptions').then(function () {
  log.debug('Removed subscriptions from database')
})
