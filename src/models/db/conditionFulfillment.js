/* stub class added for body parsing middleware in app.js */
'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin
const JsonField = require('sequelize-json')
const validator = require('../../services/validator')
const Sequelize = require('sequelize')
const sequelize = require('../../services/db')
const Transfer = require('./transfer').Transfer

class ConditionFulfillment extends Model {
  /*
   * This will be expanded when we fully decouple fulfillments from transfers
   */
}

PersistentModelMixin(ConditionFulfillment, sequelize, {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  transfer_id: Sequelize.UUID,
  type: Sequelize.ENUM('execute', 'cancel'),
  condition_fulfillment: JsonField(sequelize, 'ConditionFulfillment')
}, {
  indexes: [{ unique: true, fields: ['transfer_id'] }]
})

ConditionFulfillment.validateExternal = validator.create('ConditionFulfillment')

ConditionFulfillment.DbModel.belongsTo(Transfer.DbModel)

exports.ConditionFulfillment = ConditionFulfillment
