/* @flow */
'use strict'

const _ = require('lodash')
const db = require('../services/db')
const log = require('../services/log')('accounts')
const config = require('../services/config')
const request = require('five-bells-shared/utils/request')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError =
require('five-bells-shared/errors/unauthorized-error')
const Account = require('../models/account').Account

exports.getCollection = function * find () {
  const accounts = yield Account.findAll()
  this.body = _.invoke(accounts, 'getDataExternal')
}

exports.getConnectors = function * () {
  const accounts = yield Account.findAll({
    where: { connector: { $ne: null } }
  })
  this.body = _.invoke(accounts, 'getDataConnector')
}

/**
 * @api {get} /accounts/:name Fetch user info
 * @apiName GetAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Get information about a user.
 *
 * @apiParam {String} name Account's unique identifier
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 *
 * @returns {void}
 */
exports.getResource = function * fetch () {
  let name = this.params.name
  request.validateUriParameter('name', name, 'Identifier')
  name = name.toLowerCase()
  log.debug('fetching account name ' + name)

  const can_examine = this.req.user && (this.req.user.name === name || this.req.user.is_admin)
  const account = yield Account.findByName(name)
  if (!account) {
    throw new NotFoundError('Unknown account')
  } else if (account.is_disabled && (this.req.user && !this.req.user.is_admin)) {
    throw new UnauthorizedError('This account is disabled')
  }

  // TODO get rid of this when we start using biginteger math everywhere
  account.balance = '' + account.balance
  delete account.password

  this.body = can_examine ? account.getDataExternal() : account.getDataPublic()
  this.body.ledger = config.server.base_uri
}

/**
 * @api {put} /accounts/:name Update a user
 * @apiName PutAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Create or update a user.
 *
 * @apiParam {String} name Account's unique identifier
 *
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 *
 * @return {void}
 */
exports.putResource = function * putResource () {
  const self = this
  let name = this.params.name
  request.validateUriParameter('name', name, 'Identifier')
  name = name.toLowerCase()

  const account = self.body
  request.assert.strictEqual(account.name, name,
    'Account name must match the one in the URL')

  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  let existed
  yield db.transaction(function * (transaction) {
    existed = yield Account.findByName(name, { transaction })
    if (existed) {
      existed.setDataExternal(account)
      yield existed.save({ transaction })
    } else {
      yield Account.createExternal(account, { transaction })
    }
  })

  log.debug((existed ? 'updated' : 'created') + ' account name ' + name)

  this.body = this.body.getDataExternal()
  this.status = existed ? 200 : 201
}
