'use strict'
const hashPassword = require('five-bells-shared/utils/hashPassword')
const models = require('../models/db')

module.exports = function * (config) {
  yield setupHoldAccount()
  if (config.get('default_admin')) {
    yield setupAdminAccount(config.get('default_admin'))
  }
}

function * setupHoldAccount () {
  const holdAccount = yield models.Account.findByName('hold')
  if (!holdAccount) {
    yield models.Account.create({name: 'hold', minimum_allowed_balance: '0', balance: '0'})
  }
}

// adminParams - {user, pass, fingerprint}
function * setupAdminAccount (adminParams) {
  const adminAccount = yield models.Account.findByName(adminParams.user)
  const passwordHash =
    adminParams.pass ? yield hashPassword(adminParams.pass) : undefined

  // Update the password if the account already exists.
  if (adminAccount) {
    adminAccount.password_hash = passwordHash
    adminAccount.fingerprint = adminParams.fingerprint
    yield adminAccount.save()
  } else {
    yield models.Account.create({
      name: adminParams.user,
      balance: '0',
      password_hash: passwordHash,
      is_admin: true,
      fingerprint: adminParams.fingerprint
    })
  }
}
