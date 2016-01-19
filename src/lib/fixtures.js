'use strict'
const models = require('../models')

function Fixtures (db, config) {
  this.db = db
  this.config = config
}

Fixtures.prototype.setup = function * () {
  yield this.setupHoldAccount()
  yield this.setupAdminAccount()
}

Fixtures.prototype.setupHoldAccount = function * () {
  const holdAccount = yield models.Account.findByName('hold')
  if (!holdAccount) {
    yield models.Account.create({name: 'hold', balance: '0'})
  }
}

Fixtures.prototype.setupAdminAccount = function * () {
  if (!this.config.default_admin) return
  let adminParams = this.config.default_admin
  let adminAccount = yield models.Account.findByName(adminParams.user)
  // Update the password if the account already exists.
  if (adminAccount) {
    adminAccount.password = adminParams.pass
    yield adminAccount.save()
  } else {
    yield models.Account.create({
      name: adminParams.user,
      balance: '0',
      password: adminParams.pass,
      is_admin: true
    })
  }
}

module.exports = Fixtures
