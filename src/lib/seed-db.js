'use strict'
const hashPassword = require('five-bells-shared/utils/hashPassword')
const getAccount = require('../models/db/accounts').getAccount
const upsertAccount = require('../models/db/accounts').upsertAccount
const insertAccounts = require('../models/accounts').insertAccounts

module.exports = async function (config) {
  if (config.get('default_admin')) {
    await setupAdminAccount(config.get('default_admin'))
  }
}

// adminParams - {user, pass, fingerprint}
async function setupAdminAccount (adminParams) {
  const adminAccount = await getAccount(adminParams.user)
  const passwordHash =
    adminParams.pass ? (await hashPassword(adminParams.pass)).toString('base64') : undefined

  // Update the password if the account already exists.
  if (adminAccount) {
    adminAccount.password_hash = passwordHash
    adminAccount.fingerprint = adminParams.fingerprint
    await upsertAccount(adminAccount)
  } else {
    await insertAccounts([{
      name: adminParams.user,
      balance: '0',
      password: adminParams.pass,
      is_admin: true,
      minimum_allowed_balance: '-infinity',
      fingerprint: adminParams.fingerprint
    }])
  }
}
