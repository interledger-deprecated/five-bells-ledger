'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentKnexModelMixin
const validator = require('../../services/validator')
const knex = require('../../lib/knex').knex

class ConditionFulfillment extends Model {

  static convertToExternal (data) {
    return data.condition_fulfillment
  }

  static convertFromExternal (data) {
    return {
      condition_fulfillment: data
    }
  }

  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    data.condition_fulfillment = JSON.parse(data.condition_fulfillment)
    return data
  }

  static convertToPersistent (data) {
    data.condition_fulfillment = JSON.stringify(data.condition_fulfillment)
    return data
  }

  static findByTransfer (transferId, options) {
    return ConditionFulfillment.findByKey('transfer_id', transferId, options)
  }

  setTransferId (transferId) {
    super.setData({
      transfer_id: transferId
    })
  }
}

PersistentModelMixin(ConditionFulfillment, knex)

ConditionFulfillment.tableName = 'fulfillments'
ConditionFulfillment.validateExternal = validator.create('ConditionFulfillment')

exports.ConditionFulfillment = ConditionFulfillment
