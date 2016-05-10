'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentKnexModelMixin
const uri = require('../../services/uriManager')
const validator = require('../../services/validator')
const config = require('../../services/config')
const Entry = require('./entry').Entry

const knex = require('../../lib/knex').knex

class Account extends Model {
  static convertFromExternal (data) {
    // ID is optional on the incoming side
    if (data.id) {
      data.name = uri.parse(data.id, 'account').name.toLowerCase()
      delete data.id
    } else {
      data.name = data.name.toLowerCase()
    }

    if (data.balance) {
      data.balance = Number(data.balance)
    }

    // Passing in a password hash is a potential DoS vector because the hash
    // specifies the number of iterations needed to verify it. So a malicious
    // client could set it to UINT32_MAX and make the server do an insane amount
    // of hashing work.
    //
    // There are other places in the code that should prevent users from setting
    // the hash directly, but it's a good idea to put an extra layer of
    // protection and prevent setting it here.
    if (typeof data.password_hash !== 'undefined') {
      delete data.password_hash
    }

    if (data.minimum_allowed_balance) {
      if (data.minimum_allowed_balance === '-infinity') {
        data.minimum_allowed_balance = Number.NEGATIVE_INFINITY
      } else {
        data.minimum_allowed_balance = Number(data.minimum_allowed_balance)
      }
    }

    return data
  }

  static convertToExternal (data) {
    data.id = uri.make('account', data.name.toLowerCase())
    data.balance = String(Number(data.balance))

    // Never show any information about credentials
    delete data.password
    delete data.password_hash
    delete data.public_key
    delete data.fingerprint

    if (data.minimum_allowed_balance === Number.NEGATIVE_INFINITY) {
      data.minimum_allowed_balance = '-infinity'
    } else if (data.minimum_allowed_balance) {
      data.minimum_allowed_balance = String(Number(data.minimum_allowed_balance))
    } else {
      data.minimum_allowed_balance = '0'
    }
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
    // some databases store booleans as 0 and 1, and knex does not convert
    data.is_disabled = Boolean(data.is_disabled)
    data.is_admin = Boolean(data.is_admin)
    // oracle has balance stored properly, but knex returns it with a small
    // rounding error, possibly a bug in knex; using toFixed as workaround
    data.balance = Number(Number(data.balance).toFixed(config.amount.scale))
    if (data.minimum_allowed_balance === null) {
      data.minimum_allowed_balance = Number.NEGATIVE_INFINITY
    } else if (data.minimum_allowed_balance) {
      data.minimum_allowed_balance = Number(data.minimum_allowed_balance)
    } else {
      data.minimum_allowed_balance = 0
    }
    delete data.created_at
    delete data.updated_at
    return data
  }

  static convertToPersistent (data) {
    if (data.balance) {
      data.balance = Number(Number(data.balance).toFixed(config.amount.scale))
    }
    if (data.minimum_allowed_balance) {
      if (data.minimum_allowed_balance === Number.NEGATIVE_INFINITY) {
        data.minimum_allowed_balance = null
      } else {
        data.minimum_allowed_balance = Number(data.minimum_allowed_balance)
      }
    }
    return data
  }

  static findByName (name, options) {
    return Account.findByKey('name', name, options)
  }

  static findByFingerprint (fingerprint, options) {
    return Account.findByKey('fingerprint', fingerprint, options)
  }

  createEntry (values, options) {
    values.account = this.id
    values.balance = this.balance
    return Entry.create(values, options)
  }

  getDataPublic () {
    const data = this.getDataExternal()
    return { id: data.id, name: data.name }
  }
}

Account.validateExternal = validator.create('Account')

Account.tableName = 'accounts'
PersistentModelMixin(Account, knex)

exports.Account = Account
