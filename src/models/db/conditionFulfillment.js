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
    return data
  }

  static convertToPersistent (data) {
    return data
  }

  static findByTransfer (transferId, options) {
    return ConditionFulfillment.findByKey('transfer_id', transferId, options)
  }

  setTransferId (transferId) {
    this.setData({
      transfer_id: transferId
    })
  }
}

PersistentModelMixin(ConditionFulfillment, knex)

ConditionFulfillment.tableName = 'fulfillments'
ConditionFulfillment.validateExternal = validator.create('ConditionFulfillment')

exports.ConditionFulfillment = ConditionFulfillment
