'use strict'
const passport = require('passport-strategy')

class TokenStrategy extends passport.Strategy {
  constructor (verify) {
    super()
    this.name = 'token'
    this._verify = verify
  }

  authenticate (req) {
    const token = this._extractToken(req)
    if (!token) return this.fail(401)

    this._verify(token, (err, user) => {
      if (err) return this.error(err)
      if (!user) return this.fail(401)
      this.success(user)
    })
  }

  _extractToken (req) {
    // Look for the token in auth header and query string
    const authHeader = req.header.authorization
    if (authHeader) {
      const keyVal = authHeader.split(' ')
      if (keyVal.length === 2 && keyVal[0] === 'Bearer') {
        return keyVal[1]
      }
    }

    return req.query.token
  }
}

module.exports = TokenStrategy
