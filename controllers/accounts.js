/* @flow */
'use strict'

const _ = require('lodash')
const log = require('../services/log')('accounts')
const request = require('@ripple/five-bells-shared/utils/request')
const NotFoundError = require('@ripple/five-bells-shared/errors/not-found-error')
const Account = require('../models/account').Account

exports.find = function * find () {
  const accounts = yield Account.findAll()
  this.body = _.invoke(accounts, 'toJSONExternal')
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
exports.fetch = function * fetch () {
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

  this.body = account.toJSONExternal()
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
  let id = this.params.id
  request.validateUriParameter('id', id, 'Identifier')
  id = id.toLowerCase()
  this.body.id = id

  const created = yield Account.upsert(this.body)

  log.debug((created ? 'created' : 'updated') + ' account ID ' + id)

  this.body = Account.build(this.body).toJSONExternal()
  this.status = created ? 201 : 200
}
