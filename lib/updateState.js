'use strict';

const moment = require('moment');
const log = require('@ripple/five-bells-shared/services/log')('updateState');

function updateState(transfer, state) {
  log.debug('updating transfer state from ' + transfer.state +
    ' to ' + state);

  transfer.state = state;

  if (!transfer.timeline) {
    transfer.timeline = {};
  }
  transfer.timeline[state + '_at'] = moment().toISOString();
}

module.exports = updateState;
