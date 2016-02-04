'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin
const JsonField = require('sequelize-json')
const validator = require('../../services/validator')
const Sequelize = require('sequelize')
const sequelize = require('../../services/db')
const Transfer = require('./transfer').Transfer
const parseBody = require('co-body')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')

class ConditionFulfillment extends Model {

  // @override
  static createBodyParser () {
    const Self = this

    return function * (next) {
      let json = yield parseBody(this)
      const validationResult = Self.validateExternal(json)
      if (validationResult.valid !== true) {
        const message = validationResult.schema
          ? 'Body did not match schema ' + validationResult.schema
          : 'Body did not pass validation'
        throw new InvalidBodyError(message, validationResult.errors)
      }

      const model = new Self()
      model.setConditionFulfillment(json)
      model.setTransferId(this.params.id)
      this.body = model

      yield next
    }
  }

  static convertToExternal (data) {
    return data.condition_fulfillment
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
