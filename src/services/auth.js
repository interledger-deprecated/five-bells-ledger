'use strict'

const bcrypt = require('bcrypt')
const passport = require('koa-passport')
const BasicStrategy = require('passport-http').BasicStrategy
const ClientCertStrategy = require('passport-client-certificate').Strategy
const HTTPSignatureStrategy = require('passport-http-signature')
const AnonymousStrategy = require('passport-anonymous').Strategy
const Account = require('../models/db/account').Account
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const config = require('./config')

passport.use(new BasicStrategy(
  function (username, password, done) {
    if (!config.getIn(['auth', 'basic_enabled'])) {
      return done(new UnauthorizedError('Unsupported authentication method'))
    }

    // If no Authorization is provided we can still
    // continue without throwing an error
    if (!username) {
      return done(null, false)
    }

    Account.findByName(username)
      .then(function (userObj) {
        if (!userObj || userObj.is_disabled || !userObj.password_hash) {
          return done(new UnauthorizedError(
            'Unknown or invalid account / password'))
        }
        bcrypt.compare(password, userObj.password_hash, (error, result) => {
          if (error || !result) {
            return done(new UnauthorizedError('Invalid password'))
          }
          return done(null, userObj)
        })
      })
  }))

passport.use(new HTTPSignatureStrategy(
  function (username, done) {
    if (!config.getIn(['auth', 'http_signature_enabled'])) {
      return done(new UnauthorizedError('Unsupported authentication method'))
    }

    Account.findByName(username)
      .then(function (userObj) {
        if (!userObj || userObj.is_disabled) {
          return done(new UnauthorizedError('Unknown or invalid account'))
        }
        if (!userObj.public_key) {
          return done(new UnauthorizedError('User doesn\'t have a public key'))
        }
        done(null, userObj, userObj.public_key)
      })
  }))

passport.use(new ClientCertStrategy((certificate, done) => {
  if (!config.getIn(['auth', 'client_certificates_enabled'])) {
    return done(new UnauthorizedError('Unsupported authentication method'))
  }

  const fingerprint = certificate.fingerprint.toUpperCase()
  Account.findByFingerprint(fingerprint)
    .then(function (userObj) {
      if (!userObj || userObj.is_disabled || !userObj.fingerprint ||
          userObj.fingerprint !== fingerprint) {
        return done(new UnauthorizedError('Unknown or invalid account'))
      }
      done(null, userObj)
    })
}))

// Allow unauthenticated requests (transfers will just
// be in the proposed state)
passport.use(new AnonymousStrategy())
