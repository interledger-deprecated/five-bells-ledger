'use strict'
const hashPassword = require('five-bells-shared/utils/hashPassword')
const getAccount = require('../models/db/accounts').getAccount
const upsertAccount = require('../models/db/accounts').upsertAccount

module.exports = function * (config) {
  yield setupHoldAccount()
  if (config.get('default_admin')) {
    yield setupAdminAccount(config.get('default_admin'))
  }
}

function * setupHoldAccount () {
  const holdAccount = yield getAccount('hold')
  if (!holdAccount) {
    yield upsertAccount({name: 'hold', minimum_allowed_balance: '0', balance: '0'})
  }
}

// adminParams - {user, pass, fingerprint}
function * setupAdminAccount (adminParams) {
  const adminAccount = yield getAccount(adminParams.user)
  const passwordHash =
    adminParams.pass ? (yield hashPassword(adminParams.pass)).toString('base64') : undefined

  // Update the password if the account already exists.
  if (adminAccount) {
    adminAccount.password_hash = passwordHash
    adminAccount.fingerprint = adminParams.fingerprint
    yield upsertAccount(adminAccount)
  } else {
    yield upsertAccount({
      name: adminParams.user,
      balance: '0',
      password_hash: passwordHash,
      is_admin: true,
      fingerprint: adminParams.fingerprint
    })
  }
}
