'use strict'

const ModelMixin = require('@ripple/five-bells-shared/lib/model-mixin')
const validate = require('@ripple/five-bells-shared/services/validate')
const uri = require('../services/uriManager')

const Sequelize = require('sequelize')
const sequelize = require('../services/db')

const Account = sequelize.define('Account', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  name: Sequelize.STRING,
  balance: Sequelize.DECIMAL(10, 2),
  identity: Sequelize.STRING(1024),
  password: Sequelize.STRING
}, ModelMixin.getOptions({
  classMethods: {
    validator: validate.bind(null, 'Account'),
    filterInput: function (data) {
      // ID is optional on the incoming side
      if (data.id) {
        data.id = uri.parse(data.id, 'account').id.toLowerCase()
      }

      data.balance = Number(data.balance)
      return data
    },
    filterOutput: function (data) {
      data.id = uri.make('account', data.id.toLowerCase())
      data.balance = String(data.balance)
      delete data.password
      return data
    }
  }
}))

exports.Account = Account
