'use strict'

const knex = require('../../lib/knex').knex
const assert = require('assert')

const TABLE_NAME = 'L_LU_TRANSFER_STATUS'
const ID_TO_NAME = new Map()
const NAME_TO_ID = new Map()

function readTransferStatuses () {
  return knex(TABLE_NAME).select().then((rows) => {
    rows.forEach((row) => {
      ID_TO_NAME.set(row.STATUS_ID, row.NAME)
      NAME_TO_ID.set(row.NAME, row.STATUS_ID)
    })
  })
}

function getTransferStatusName (transferStatusId) {
  assert(ID_TO_NAME.has(transferStatusId), 'Unable to find name for id ' +
    transferStatusId + ' in ' + TABLE_NAME)
  return ID_TO_NAME.get(transferStatusId)
}

function getTransferStatusId (transferStatusName) {
  assert(NAME_TO_ID.has(transferStatusName), 'Unable to find name ' +
    transferStatusName + ' in ' + TABLE_NAME)
  return NAME_TO_ID.get(transferStatusName)
}

module.exports = {
  readTransferStatuses,
  getTransferStatusName,
  getTransferStatusId
}
