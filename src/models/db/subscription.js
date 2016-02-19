'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentKnexModelMixin
const validator = require('../../services/validator')
const uri = require('../../services/uriManager')
const knex = require('../../lib/knex').knex

class Subscription extends Model {
  static convertFromExternal (data) {
    // ID is optional on the incoming side
    if (data.id) {
      data.id = uri.parse(data.id, 'subscription').id.toLowerCase()
    }

    return data
  }

  static convertToExternal (data) {
    data.id = uri.make('subscription', data.id.toLowerCase())
    if (data.subject === null) delete data.subject

    return data
  }

  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    return data
  }
}

Subscription.validateExternal = validator.create('Subscription')

Subscription.tableName = 'subscriptions'
PersistentModelMixin(Subscription, knex)

exports.Subscription = Subscription
