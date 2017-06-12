'use strict'

const jwt = require('jsonwebtoken')
const config = require('../services/config')
const uri = require('../services/uriManager')

function getAuthToken (requestingUser) {
  return new Promise((resolve, reject) => {
    jwt.sign({}, config.authTokenSecret, {
      algorithm: 'HS256',
      subject: uri.make('account', requestingUser.name.toLowerCase()),
      issuer: config.server.base_uri,
      expiresIn: config.authTokenMaxAge
    }, (err, token) => {
      if (err) return reject(err)
      resolve(token)
    })
  })
}

module.exports = { getAuthToken }
