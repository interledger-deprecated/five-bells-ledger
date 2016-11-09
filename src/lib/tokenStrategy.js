'use strict'
const passport = require('passport-strategy')

class TokenStrategy extends passport.Strategy {
  constructor (verify) {
    super()
    this.name = 'token'
    this._verify = verify
  }

  authenticate (req) {
    const token = req.query.token
    if (!token) return this.fail(400)

    this._verify(token, (err, user) => {
      if (err) return this.fail(400)
      if (!user) return this.fail(401)
      this.success(user)
    })
  }
}

module.exports = TokenStrategy
