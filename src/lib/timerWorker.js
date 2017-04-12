'use strict'

const moment = require('moment')
const defer = require('co-defer')

const MAX_32INT = 2147483647

class TimerWorker {
  constructor (timeQueue, transferExpiryMonitor) {
    this.timeQueue = timeQueue
    this.transferExpiryMonitor = transferExpiryMonitor
    this.timeout = null
    this.listener = null
  }

  async start () {
    const _this = this

    // Make sure we only have one listener waiting for new
    // items to be added to the timeQueue
    _this.listener = async function () {
      await _this.processTimeQueue()
    }
    _this.timeQueue.on('insert', _this.listener)

    await this.processTimeQueue()
  }

  async processTimeQueue () {
    const _this = this

    // Process expired transfers
    await this.transferExpiryMonitor.processExpiredTransfers()

    // Set the timer to the earliest date on the timeQueue
    if (this.timeout) {
      clearTimeout(this.timeout)
    }
    const earliestDate = this.timeQueue.getEarliestDate()

    // Don't reschedule the timer if nothing is waiting
    if (!earliestDate) {
      return
    }

    // If we set the timeout to greater than the MAX_32INT it
    // will be triggered right away so we'll just set it to
    // the longest possible timeout and that will cause us to check again
    const timeoutDuration = Math.min(moment(earliestDate).diff(moment()), MAX_32INT)
    this.timeout = defer.setTimeout(async function () {
      await _this.processTimeQueue()
    }, timeoutDuration)
  }

  stop () {
    const _this = this

    clearTimeout(_this.timeout)
    if (_this.listener) {
      _this.timeQueue.off('insert', _this.listener)
      _this.listener = null
    }
  }
}

exports.TimerWorker = TimerWorker
