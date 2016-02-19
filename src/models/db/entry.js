'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentKnexModelMixin
const knex = require('../../lib/knex').knex

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

Entry.tableName = 'entries'
PersistentModelMixin(Entry, knex)

exports.Entry = Entry
