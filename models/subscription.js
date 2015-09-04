'use strict'

const ModelMixin = require('@ripple/five-bells-shared/lib/model-mixin')
const validate = require('@ripple/five-bells-shared/services/validate')
const uri = require('../services/uriManager')

const Sequelize = require('sequelize')
const sequelize = require('../services/db')

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

exports.Subscription = Subscription
