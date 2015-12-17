/* @flow */
'use strict'

const _ = require('lodash')
const db = require('../services/db')
const log = require('../services/log')('accounts')
const request = require('five-bells-shared/utils/request')
const NotFoundError = require('five-bells-shared/errors/not-found-error')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
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

  let can_modify = this.req.user.name === id || this.req.user.is_admin
  if (!can_modify) {
    throw new UnauthorizedError('You don\'t have permission to examine this user')
  }

  const account = yield Account.findByName(id)
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

  // SQLite's implementation of upsert does not tell you whether it created the
  // row or whether it already existed. Since we need to know to return the
  // correct HTTP status code we unfortunately have to do this in two steps.
  let existed
  yield db.transaction(function * (transaction) {
    existed = yield Account.findByName(id, { transaction })
    if (existed) {
      existed.setDataExternal(self.body)
      yield existed.save({ transaction })
    } else {
      yield Account.createExternal(self.body, { transaction })
    }
  })

  log.debug((existed ? 'updated' : 'created') + ' account ID ' + id)

  this.body = this.body.getDataExternal()
  this.status = existed ? 200 : 201
}

/**
 * @api {delete} /accounts/:id Delete a user
 * @apiName DeleteAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Delete a user.
 *
 * @apiParam {String} id Account's unique identifier
 *
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 *
 * @return {void}
 */
exports.deleteResource = function * deleteResource () {
  const self = this
  let id = this.params.id
  request.validateUriParameter('id', id, 'Identifier')
  id = id.toLowerCase()

  yield db.transaction(function * (transaction) {
    const account = yield Account.findByName(id, { transaction })
    if (account) {
      self.body = account.getDataExternal()
      yield account.destroy({ transaction })
      log.debug('deleted account ID ' + id)
      self.status = 200
    } else {
      self.status = 404
    }
  })
}
