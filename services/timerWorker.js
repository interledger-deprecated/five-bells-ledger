'use strict'

const TimerWorker = require('../lib/timerWorker').TimerWorker
const timeQueue = require('./timeQueue')
const transferExpiryMonitor = require('./transferExpiryMonitor')

module.exports = new TimerWorker(timeQueue, transferExpiryMonitor)
