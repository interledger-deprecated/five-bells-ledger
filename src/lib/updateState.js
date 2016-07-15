'use strict'

const moment = require('moment')
const log = require('../services/log').create('updateState')

function updateState (transfer, state) {
  log.debug('updating transfer state from ' + transfer.state +
    ' to ' + state)

  transfer.state = state
  transfer[state + '_at'] = moment().toISOString()
}

module.exports = updateState
