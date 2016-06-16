'use strict'

const knex = require('../../lib/knex').knex
const assert = require('assert')

const TABLE_NAME = 'L_LU_REJECTION_REASON'
const ID_TO_NAME = new Map()
const NAME_TO_ID = new Map()

function readRejectionReasons () {
  return knex(TABLE_NAME).select().then((rows) => {
    rows.forEach((row) => {
      ID_TO_NAME.set(row.REJECTION_REASON_ID, row.NAME)
      NAME_TO_ID.set(row.NAME, row.REJECTION_REASON_ID)
    })
  })
}

function getRejectionReasonName (rejectionReasonId) {
  assert(ID_TO_NAME.has(rejectionReasonId), 'Unable to find name for id ' +
    rejectionReasonId + ' in ' + TABLE_NAME)
  return ID_TO_NAME.get(rejectionReasonId)
}

function getRejectionReasonId (rejectionReasonName) {
  assert(NAME_TO_ID.has(rejectionReasonName), 'Unable to find name ' +
    rejectionReasonName + ' in ' + TABLE_NAME)
  return NAME_TO_ID.get(rejectionReasonName)
}

module.exports = {
  readRejectionReasons,
  getRejectionReasonName,
  getRejectionReasonId
}
