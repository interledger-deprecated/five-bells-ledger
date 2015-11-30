'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin

const Sequelize = require('sequelize')
const sequelize = require('../services/db')

class Entry extends Model {
  static convertFromExternal (data) {
    data.balance = Number(data.balance)
    return data
  }

  static convertToExternal (data) {
    data.balance = String(data.balance)
    return data
  }

  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    return data
  }

  static convertToPersistent (data) {
    data.balance = Number(data.balance)
    return data
  }
}

PersistentModelMixin(Entry, sequelize, {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  entry_group: Sequelize.UUID,
  transfer_id: Sequelize.UUID,
  account: Sequelize.INTEGER,
  balance: Sequelize.DECIMAL(10, 2),
  created_at: Sequelize.DATE,
  updated_at: Sequelize.DATE
})

exports.Entry = Entry
