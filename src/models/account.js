'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin
const uri = require('../services/uriManager')
const validator = require('../services/validator')
const Entry = require('./entry').Entry
const EntryGroup = require('./entry-group').EntryGroup

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
    delete data.public_key
    if (!data.identity) delete data.identity
    if (!data.is_admin) delete data.is_admin
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

  createEntry (values, options) {
    values.account = this.id
    values.balance = this.balance
    return Entry.create(values, options)
  }

  * findEntry (date) {
    const group = yield EntryGroup.findOne({
      where: { created_at: { $lte: date } },
      order: 'created_at DESC',
      limit: 1
    })
    if (!group) return
    return Entry.findOne({
      where: {
        account: this.id,
        entry_group: { $lte: group.id }
      },
      order: 'entry_group DESC',
      limit: 1
    })
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
  password: Sequelize.STRING,
  public_key: Sequelize.TEXT,
  is_admin: Sequelize.BOOLEAN
})

exports.Account = Account
