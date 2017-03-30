'use strict'

const moment = require('moment')
const log = require('../services/log').create('updateState')

function updateState (transfer, state, opts) {
  log.debug('updating transfer state from ' + transfer.state +
    ' to ' + state)

  transfer.state = state
  const updatedAt = opts && opts.updatedAt || moment()
  transfer[state + '_at'] = updatedAt.toISOString()
}

module.exports = updateState
