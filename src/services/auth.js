'use strict'

const passport = require('koa-passport')
const BasicStrategy = require('passport-http').BasicStrategy
const HTTPSignatureStrategy = require('passport-http-signature')
const AnonymousStrategy = require('passport-anonymous').Strategy
const Account = require('../models/account').Account
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const config = require('./config')

passport.use(new BasicStrategy(
  function (username, password, done) {
    if (!config.auth_enabled.basic) {
      return done(new UnauthorizedError('Unsupported authentication method'))
    }

    // If no Authorization is provided we can still
    // continue without throwing an error
    if (!username) {
      return done(null, false)
    }

    Account.findByName(username)
      .then(function (userObj) {
        if (userObj && password && userObj.password === password) {
          return done(null, userObj)
        } else {
          return done(new UnauthorizedError('Unknown or invalid account / password'))
        }
      })
  }))

passport.use(new HTTPSignatureStrategy(
  function (username, done) {
    if (!config.auth_enabled.http_signature) {
      return done(new UnauthorizedError('Unsupported authentication method'))
    }

    Account.findByName(username)
      .then(function (userObj) {
        if (!userObj) {
          return done(new UnauthorizedError('Unknown or invalid account'))
        }
        if (!userObj.public_key) {
          return done(new UnauthorizedError('User doesn\'t have a public key'))
        }
        done(null, userObj, userObj.public_key)
      })
  }))

// Allow unauthenticated requests (transfers will just
// be in the proposed state)
passport.use(new AnonymousStrategy())
