'use strict'

const _ = require('lodash')
const uri = require('../../services/uriManager')

function convertToInternalAccount (data) {
  // ID is optional on the incoming side
  data = _.cloneDeep(data)
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

function convertToExternalAccount (data) {
  data = _.cloneDeep(data)
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

module.exports = {
  convertToExternalAccount,
  convertToInternalAccount
}
