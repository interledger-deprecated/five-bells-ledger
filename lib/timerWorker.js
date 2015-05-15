'use strict';

const moment = require('moment');
const defer = require('co-defer');

const MAX_32INT = 2147483647;

function TimerWorker(timeQueue, transferExpiryMonitor) {
  this.timeQueue = timeQueue;
  this.transferExpiryMonitor = transferExpiryMonitor;
  this.timeout = null;
  this.listener = null;
}

TimerWorker.prototype.start = function *() {
  const self = this;

  // Make sure we only have one listener waiting for new
  // items to be added to the timeQueue
  if (!self.listener) {
    self.listener = function*() {
      yield self.start();
    };
    self.timeQueue.on('insert', self.listener);
  }


  // Process expired transfers
  yield this.transferExpiryMonitor.processExpiredTransfers();

  // Set the timer to the earliest date on the timeQueue
  if (this.timeout) {
    clearTimeout(this.timeout);
  }
  const earliestDate = this.timeQueue.getEarliestDate();

  // If we set the timeout to greater than the MAX_32INT it
  // will be triggered right away so we'll just set it to
  // the longest possible timeout and that will cause us to check again
  const timeoutDuration = Math.min(moment(earliestDate).diff(moment()),
                                   MAX_32INT);
  this.timeout = defer.setTimeout(function*() {
    yield self.start();
  }, timeoutDuration);
};

TimerWorker.prototype.stop = function() {
  const self = this;

  clearTimeout(self.timeout);
  if (self.listener) {
    self.timeQueue.off('insert', self.listener);
    self.listener = null;
  }
};

exports.TimerWorker = TimerWorker;
