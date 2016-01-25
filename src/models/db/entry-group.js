'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin

const Sequelize = require('sequelize')
const sequelize = require('../../services/db')

class EntryGroup extends Model {
  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    return data
  }
}

PersistentModelMixin(EntryGroup, sequelize, {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  created_at: Sequelize.DATE,
  updated_at: Sequelize.DATE
})

exports.EntryGroup = EntryGroup
