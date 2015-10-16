'use strict'

const Model = require('@ripple/five-bells-shared').Model
const PersistentModelMixin = require('@ripple/five-bells-shared').PersistentModelMixin
const uri = require('../services/uriManager')
const validator = require('../services/validator')

const Sequelize = require('sequelize')
const sequelize = require('../services/db')

class Account extends Model {
  static convertFromExternal (data) {
    // ID is optional on the incoming side
    if (data.id) {
      data.id = uri.parse(data.id, 'account').id.toLowerCase()
    }

    data.balance = Number(data.balance)
    return data
  }

  static convertToExternal (data) {
    data.id = uri.make('account', data.id.toLowerCase())
    data.balance = String(data.balance)
    delete data.password
    if (!data.identity) delete data.identity
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

Account.validateExternal = validator.create('Account')

PersistentModelMixin(Account, sequelize, {
  id: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  name: Sequelize.STRING,
  balance: Sequelize.DECIMAL(10, 2),
  identity: Sequelize.STRING(1024),
  password: Sequelize.STRING
})

exports.Account = Account
