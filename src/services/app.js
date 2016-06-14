'use strict'

const App = require('../lib/app')
module.exports = new App({
  log: require('./log'),
  config: require('./config'),
  timerWorker: require('./timerWorker'),
  notificationWorker: require('./notificationWorker')
})
