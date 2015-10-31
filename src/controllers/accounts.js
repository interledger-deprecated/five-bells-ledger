/* @flow */
'use strict'

const _ = require('lodash')
const db = require('../services/db')
const log = require('../services/log')('accounts')
const request = require('five-bells-shared/utils/request')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const Account = require('../models/account').Account

exports.getCollection = function * find () {
  const accounts = yield Account.findAll()
  this.body = _.invoke(accounts, 'getDataExternal')
}

/**
 * @api {get} /accounts/:id Fetch user info
 * @apiName GetAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Get information about a user.
 *
 * @apiParam {String} id Account's unique identifier
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 *
 * @returns {void}
 */
exports.getResource = function * fetch () {
  let id = this.params.id
  request.validateUriParameter('id', id, 'Identifier')
  id = id.toLowerCase()
  log.debug('fetching account ID ' + id)

  const account = yield Account.findById(id)
  if (!account) {
    throw new NotFoundError('Unknown account ID')
  }

  // TODO get rid of this when we start using biginteger math everywhere
  account.balance = '' + account.balance

  delete account.password

  this.body = account.getDataExternal()
}

/**
 * @api {put} /accounts/:id Update a user
 * @apiName PutAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Create or update a user.
 *
 * @apiParam {String} id Account's unique identifier
 *
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 *
 * @return {void}
 */
exports.putResource = function * putResource () {
  const self = this
  let id = this.params.id
  request.validateUriParameter('id', id, 'Identifier')
  id = id.toLowerCase()
  this.body.id = id

  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  let existed
  yield db.transaction(function * (transaction) {
    existed = yield Account.findById(self.body.id, { transaction })
    yield Account.upsert(self.body, { transaction })
  })

  log.debug((existed ? 'updated' : 'created') + ' account ID ' + id)

  this.body = this.body.getDataExternal()
  this.status = existed ? 200 : 201
}
