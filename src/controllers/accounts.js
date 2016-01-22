/* @flow */
'use strict'

const request = require('five-bells-shared/utils/request')
const model = require('../models/accounts')

function * getCollection () {
  this.body = yield model.getAccounts()
}

function * getConnectors () {
  this.body = yield model.getConnectors()
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
function * getResource () {
  const name = this.params.name
  request.validateUriParameter('name', name, 'Identifier')
  this.body = yield model.getAccount(name.toLowerCase(), this.req.user)
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
function * putResource () {
  const name = this.params.name
  request.validateUriParameter('name', name, 'Identifier')
  const account = this.body
  request.assert.strictEqual(account.name, name.toLowerCase(),
    'Account name must match the one in the URL')
  const result = yield model.setAccount(account, this.req.user)
  this.body = result.account
  this.status = result.existed ? 200 : 201
}

module.exports = {
  getCollection,
  getConnectors,
  getResource,
  putResource
}
