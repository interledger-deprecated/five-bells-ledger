'use strict'

const TABLE_NAME = 'L_TRANSFERS'
const _ = require('lodash')
const client = require('./utils').client
const db = require('./utils')(TABLE_NAME,
  convertToPersistent, convertFromPersistent)
const withTransaction = require('../../lib/db').withTransaction
const rejectionReasons = require('./rejectionReasons')
const transferStatuses = require('./transferStatuses')
const adjustments = require('./adjustments')
const removeAuditFields = require('./audit').removeAuditFields
const getAccountById = require('./accounts').getAccountById
const getAccountId = require('./accounts').getAccountId
const log = require('../../services/log').create('db_transfers')

function convertFromPersistent (data) {
  data = _.cloneDeep(data)
  data = _.mapKeys(data, (value, key) => key.toLowerCase())
  data.id = data.transfer_uuid
  data._id = data.transfer_id
  delete data.transfer_id
  delete data.transfer_uuid
  delete data.created_at
  delete data.updated_at
  data.additional_info = JSON.parse(data.additional_info)
  if (data.expires_dttm) {
    data.expires_at = new Date(data.expires_dttm)
    delete data.expires_dttm
  }
  if (data.proposed_dttm) {
    data.proposed_at = new Date(data.proposed_dttm)
    delete data.proposed_dttm
  }
  if (data.prepared_dttm) {
    data.prepared_at = new Date(data.prepared_dttm)
    delete data.prepared_dttm
  }
  if (data.executed_dttm) {
    data.executed_at = new Date(data.executed_dttm)
    delete data.executed_dttm
  }
  if (data.rejected_dttm) {
    data.rejected_at = new Date(data.rejected_dttm)
    delete data.rejected_dttm
  }
  if (data.rejection_reason_id !== null) {
    data.rejection_reason = rejectionReasons.getRejectionReasonName(
      data.rejection_reason_id)
    delete data.rejection_reason_id
  }
  data.state = transferStatuses.getTransferStatusName(data.status_id)
  delete data.status_id
  data = _.omitBy(data, _.isNull)
  const converted =  removeAuditFields(data)
  log.debug('convertFromPersistent', converted)
  return converted
}

function convertToPersistent (data) {
  data = _.cloneDeep(data)
  data.additional_info = JSON.stringify(data.additional_info)
  if (data.proposed_at) {
    data.proposed_dttm = new Date(data.proposed_at)
    delete data.proposed_at
  }
  if (data.prepared_at) {
    data.prepared_dttm = new Date(data.prepared_at)
    delete data.prepared_at
  }
  if (data.executed_at) {
    data.executed_dttm = new Date(data.executed_at)
    delete data.executed_at
  }
  if (data.rejected_at) {
    data.rejected_dttm = new Date(data.rejected_at)
    delete data.rejected_at
  }
  if (data.expires_at) {
    data.expires_dttm = new Date(data.expires_at)
    delete data.expires_at
  }
  if (data.rejection_reason) {
    data.rejection_reason_id = rejectionReasons.getRejectionReasonId(
      data.rejection_reason)
    delete data.rejection_reason
  }
  if (data.state) {
    data.status_id = transferStatuses.getTransferStatusId(data.state)
    delete data.state
  }
  data.transfer_uuid = data.id
  delete data.id
  const persistent = _.mapKeys(data, (value, key) => key.toUpperCase())
  log.debug('convertToPersistent', persistent)
  return persistent
}

function * getTransferWhere (where, options) {
  return db.selectOne(where, options && options.transaction)
}

function * getTransfersWhere (where, options) {
  return db.select(where, options && options.transaction)
  .then((transfers) => {
    if (_.isEmpty(transfers)) {
      return []
    }
  })
}

function * getTransfer (uuid, options) {
  return yield getTransferWhere({TRANSFER_UUID: uuid}, options)
}

function getTransferId (uuid, options) {
  return db.selectOne({TRANSFER_UUID: uuid},
    options && options.transaction).then(
      (transfer) => transfer ? transfer._id : null)
}

function * getTransferById (id, options) {
  return yield getTransferWhere({TRANSFER_ID: id}, options)
}

function * getTransfersByExecutionCondition (executionCondition, options) {
  return yield getTransfersWhere({EXECUTION_CONDITION: executionCondition}, options)
}

function * replaceAccountNameWithId (transfer, options) {
  transfer.debit_account_id = yield getAccountId(transfer.debit_account, options)
  transfer.credit_account_id = yield getAccountId(transfer.credit_account, options)
  delete transfer.debit_account
  delete transfer.credit_account
}

function * updateTransfer (transfer, options) {
  const transaction = options && options.transaction
  yield replaceAccountNameWithId(transfer, options)
  return db.update(transfer, {TRANSFER_UUID: transfer.id}, transaction)
}

function * insertTransfer (transfer, options) {
  const transaction = options && options.transaction
  yield replaceAccountNameWithId(transfer, options)
  return db.insert(transfer, options)
}

function * insertTransfers (transfers, options) {
  const results = []
  for (let transfer of transfers) {
    results.push(yield insertTransfer(transfer, options))
  }
  return results
}

function * upsertTransfer (transfer, options) {
  const transaction = options && options.transaction
  yield replaceAccountNameWithId(transfer, options)
  return db.upsert(transfer, {TRANSFER_UUID: transfer.id}, transaction)
}

module.exports = {
  getTransfer,
  getTransferId,
  getTransferById,
  getTransfersByExecutionCondition,
  upsertTransfer,
  updateTransfer,
  insertTransfers,
  withTransaction,
  client
}
