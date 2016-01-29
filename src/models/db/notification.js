'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin

const Sequelize = require('sequelize')
const sequelize = require('../../services/db')
const Transfer = require('./transfer').Transfer
const Subscription = require('./subscription').Subscription

class Notification extends Model {
  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    return data
  }
}

PersistentModelMixin(Notification, sequelize, {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  subscription_id: Sequelize.UUID,
  transfer_id: Sequelize.UUID,
  retry_count: Sequelize.INTEGER,
  retry_at: Sequelize.DATE
}, {
  indexes: [
    {
      unique: true,
      fields: ['subscription_id', 'transfer_id']
    },
    { fields: ['retry_at'] }
  ]
})

Notification.DbModel.belongsTo(Transfer.DbModel)
Notification.DbModel.belongsTo(Subscription.DbModel)

exports.Notification = Notification
