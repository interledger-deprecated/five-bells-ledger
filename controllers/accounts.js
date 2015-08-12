/* @flow */
'use strict'

const _ = require('lodash')
const db = require('../services/db')
const log = require('../services/log')('accounts')
const request = require('@ripple/five-bells-shared/utils/request')
const NotFoundError = require('@ripple/five-bells-shared/errors/not-found-error')
const uri = require('../services/uriManager')
const Account = require('../models/account').Account

exports.find = function * find () {
  const accounts = yield db.get(['accounts'])
  this.body = _.values(accounts).map(function (account) {
    account.id = uri.make('account', account.id)
    return account
  })
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

  const account = yield Account.get(id, db)
  if (!account) {
    throw new NotFoundError('Unknown account ID')
  }

  // TODO get rid of this when we start using biginteger math everywhere
  account.balance = '' + account.balance

  delete account.password

  this.body = account.getData()
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
  const account = this.body

  account.id = id

  let existing = false
  yield db.transaction(function *(tr) {
    const existingAccount = yield tr.get(['accounts', id])

    if (existingAccount) {
      existing = true
    }

    tr.put(['accounts', id], account)
  })
  log.debug((existing ? 'updated' : 'created') + ' account ID ' + id)

  this.body = account.getData()
  this.status = existing ? 200 : 201
}
