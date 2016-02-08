'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin
const JsonField = require('sequelize-json')
const validator = require('../../services/validator')
const Sequelize = require('sequelize')
const sequelize = require('../../services/db')
const Transfer = require('./transfer').Transfer

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

  static findByTransfer (transferId, options) {
    return ConditionFulfillment.findOne({
      where: {transfer_id: transferId},
      transaction: options && options.transaction
    })
  }

  setTransferId (transferId) {
    super.setData({
      transfer_id: transferId
    })
  }

  setConditionFulfillment (conditionFulfillment) {
    super.setData({
      condition_fulfillment: conditionFulfillment
    })
  }
}

PersistentModelMixin(ConditionFulfillment, sequelize, {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  transfer_id: Sequelize.UUID,
  condition_fulfillment: JsonField(sequelize, 'ConditionFulfillment', 'condition_fulfillment')
}, {
  indexes: [{ unique: true, fields: ['transfer_id'] }]
})

ConditionFulfillment.validateExternal = validator.create('ConditionFulfillment')

ConditionFulfillment.DbModel.belongsTo(Transfer.DbModel)

exports.ConditionFulfillment = ConditionFulfillment
