'use strict';

const _ = require('lodash');
const moment = require('moment');
const emitter = require('co-emitter');
const PriorityQueue = require('priorityqueuejs');

function TimeQueue() {
  this._queue = new PriorityQueue(function(a, b) {
    return b.date - a.date;
  });
}
emitter(TimeQueue.prototype);

TimeQueue.prototype.insert = function*(date, item) {
  const dateValue = moment(date).valueOf();
  this._queue.enq({
    date: dateValue,
    item: item
  });

  // This event is used by the worker started in app.js
  yield this.emit('insert', dateValue, item);
};

TimeQueue.prototype.getEarliestDate = function() {
  if (this._queue.isEmpty()) {
    return null;
  }
  return this._queue.peek().date;
};

/**
 * Return all items that are due on or before the provided date.
 *
 * @param {Number} date Cutoff date
 * @return {Array} Queued items
 */
TimeQueue.prototype.popBeforeDate = function(date) {
  // pull modifies the original array
  const dateValue = moment(date).valueOf();
  const arrayItems = [];
  while (!this._queue.isEmpty() && this._queue.peek().date <= dateValue) {
    arrayItems.push(this._queue.deq().item);
  }
  return arrayItems;
};

TimeQueue.prototype.includes = function(item) {
  return _.some(this._queue._elements, function(obj) {
    return _.isEqual(obj.item, item);
  });
};

TimeQueue.prototype.remove = function(item) {
  _.remove(this._queue._elements, function(obj) {
    return obj.item === item;
  });
};

exports.TimeQueue = TimeQueue;
