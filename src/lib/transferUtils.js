'use strict'

const _ = require('lodash')
const FINAL_STATES = require('five-bells-shared')
  .TransferStateDictionary.finalStates

function isTransferFinalized (transfer) {
  return _.includes(FINAL_STATES, transfer.state)
}

module.exports = {
  isTransferFinalized
}
