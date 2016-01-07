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
    if (data.primary) {
      delete data.primary
    }

    // ID is optional on the incoming side
    if (data.id) {
      data.name = uri.parse(data.id, 'account').name.toLowerCase()
      delete data.id
    }

    data.balance = Number(data.balance)
    return data
  }

  static convertToExternal (data) {
    data.id = uri.make('account', data.name.toLowerCase())
    data.balance = String(data.balance)
    delete data.primary
    delete data.password
    delete data.public_key
    if (!data.connector) delete data.connector
    if (!data.is_admin) delete data.is_admin
    return data
  }

  getDataConnector () {
    return {
      id: uri.make('account', this.name.toLowerCase()),
      name: this.name,
      connector: this.connector
    }
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

  static findById (id, options) {
    return Account.findOne({
      where: {primary: id},
      transaction: options && options.transaction
    })
  }

  static findByName (name, options) {
    return Account.findOne({
      where: {name: name},
      transaction: options && options.transaction
    })
  }

  createEntry (values, options) {
    values.account = this.primary
    values.balance = this.balance
    return Entry.create(values, options)
  }

  getDataPublic () {
    const data = this.getDataExternal()
    return { id: data.id, name: data.name }
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
        account: this.primary,
        entry_group: { $lte: group.id }
      },
      order: 'entry_group DESC',
      limit: 1
    })
  }
}

Account.validateExternal = validator.create('Account')

PersistentModelMixin(Account, sequelize, {
  primary: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: Sequelize.STRING, unique: true },
  balance: Sequelize.DECIMAL(10, 2),
  connector: Sequelize.STRING(1024),
  password: Sequelize.STRING,
  public_key: Sequelize.TEXT,
  is_admin: Sequelize.BOOLEAN,
  disabled: Sequelize.BOOLEAN
})

exports.Account = Account
