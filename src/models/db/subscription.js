'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin
const validator = require('../../services/validator')
const uri = require('../../services/uriManager')

const Sequelize = require('sequelize')
const sequelize = require('../../services/db')

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

PersistentModelMixin(Subscription, sequelize, {
  id: {
    type: Sequelize.UUID,
    primaryKey: true
  },
  owner: Sequelize.STRING(1024),
  event: Sequelize.STRING,
  subject: Sequelize.STRING(1024),
  target: Sequelize.STRING(1024)
})

/*
const Subscription = sequelize.define('Subscription', {
  id: {
    type: Sequelize.UUID,
    primaryKey: true
  },
  owner: Sequelize.STRING(1024),
  event: Sequelize.STRING,
  subject: Sequelize.STRING(1024),
  target: Sequelize.STRING(1024)
}, ModelMixin.getOptions({
  classMethods: {
    validator: validate.bind(null, 'Subscription'),
    filterInput: function (data) {
      // ID is optional on the incoming side
      if (data.id) {
        data.id = uri.parse(data.id, 'subscription').id.toLowerCase()
      }

      return data
    },
    filterOutput: function (data) {
      data.id = uri.make('subscription', data.id.toLowerCase())

      return data
    }
  }
}))
*/
exports.Subscription = Subscription
