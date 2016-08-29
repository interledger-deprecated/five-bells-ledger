'use strict'

const _ = require('lodash')
const moment = require('moment')
const db = require('./utils')('L_FULFILLMENTS',
  convertToPersistent, convertFromPersistent)
const getTransferId = require('./transfers').getTransferId
const getTransferById = require('./transfers').getTransferById
const removeAuditFields = require('./audit').removeAuditFields
const TransferNotFoundError = require('../../errors/transfer-not-found-error')
const FulfillmentNotFoundError = require('../../errors/fulfillment-not-found-error')

function convertFromPersistent (data) {
  const result = _.mapKeys(_.cloneDeep(data), (value, key) => key.toLowerCase())
  result.id = result.fulfillment_id
  delete result.fulfillment_id
  delete result.created_at
  delete result.updated_at
  return removeAuditFields(result)
}

function convertToPersistent (data) {
  const result = _.cloneDeep(data)
  if (result.id) {
    result.fulfillment_id = result.id
    delete result.id
  }
  return _.mapKeys(result, (value, key) => key.toUpperCase())
}

function * convertToIntegerTransferId (fulfillment, options) {
  return getTransferId(fulfillment.transfer_id, options).then((transferId) => {
    return _.assign({}, fulfillment, {transfer_id: transferId})
  })
}

function * insertFulfillments (fulfillments, options) {
  for (const fulfillment of fulfillments) {
    const row = yield convertToIntegerTransferId(fulfillment, options)
    yield db.insert(row, options && options.transaction)
  }
}

function * getFulfillment (transferUuid, options) {
  const transferId = yield getTransferId(transferUuid, options)
  if (!transferId) {
    throw new TransferNotFoundError('This transfer does not exist')
  }
  const transfer = yield getTransferById(transferId, options)
  return db.selectOne({TRANSFER_ID: transferId},
    options && options.transaction).then((result) => {
      if (!result) {
        if (transfer.expires_at && moment().isAfter(transfer.expires_at)) {
          throw new FulfillmentNotFoundError('This transfer expired before it was fulfilled')
        }
        throw new FulfillmentNotFoundError('This transfer has not yet been fulfilled')
      }
      result.transfer_id = transferUuid
      return result
    })
}

function * maybeGetFulfillment (transferUuid, options) {
  try {
    return yield getFulfillment(transferUuid, options)
  } catch (err) {
    return null
  }
}

function * upsertFulfillment (fulfillment, options) {
  const where = {FULFILLMENT_ID: fulfillment.id}
  const row = yield convertToIntegerTransferId(fulfillment, options)
  return db.upsert(row, where, options && options.transaction)
}

module.exports = {
  maybeGetFulfillment,
  getFulfillment,
  insertFulfillments,
  upsertFulfillment
}
