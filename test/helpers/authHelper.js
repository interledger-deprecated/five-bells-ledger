'use strict'

class AuthHelper {
  constructor (testContext) {
    this.context = testContext
  }

  async adminToken () {
    return this.getUserToken('admin')
  }

  async getUserToken (user) {
    const resp = await this.context.request()
      .get('/auth_token')
      .auth(user, user)

    return resp.body.token ? resp.body.token : 'invalidToken'
  }
}

exports.AuthHelper = AuthHelper
