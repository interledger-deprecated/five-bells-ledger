'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentKnexModelMixin
const knex = require('../../lib/knex').knex

class Notification extends Model {
  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    return data
  }
}

Notification.tableName = 'notifications'
PersistentModelMixin(Notification, knex)

exports.Notification = Notification
