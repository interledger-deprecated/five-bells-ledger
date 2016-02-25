/* @flow */
'use strict'

const request = require('five-bells-shared/utils/request')
const model = require('../models/accounts')

function * getCollection () {
  this.body = yield model.getAccounts()
}

/**
 * @api {get} /connectors Fetch connectors
 * @apiName GetConnectors
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Get all accounts of all connectors on this ledger.
 *
 * @apiExample {shell} Get connectors
 *    curl -x GET
 *    http://usd-ledger.example/USD/connectors
 *
 * @apiSuccessExample {json} 200 Response:
 *    HTTP/1.1 200 OK
 *    [
 *      {
 *        id: 'http://usd-ledger.example/USD/accounts/chloe',
 *        name: 'chloe',
 *        connector: 'http://usd-eur-connector.example'
 *      }
 *    ]
 *
 * @returns {void}
 */
function * getConnectors () {
  this.body = yield model.getConnectors()
}

/**
 * @api {get} /accounts/:name Fetch user info
 * @apiName GetAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Get information about a user. Only users themselves and admins
 *    are allowed to see the full account details.
 *
 * @apiParam {String} name Account's unique identifier
 *
 * @apiExample {shell} Get account
 *    curl -x GET -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l"
 *    http://usd-ledger.example/USD/accounts/alice
 *
 * @apiSuccessExample {json} 200 Authenticated Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/USD/accounts/alice",
 *      "name": "alice",
 *      "balance": "100",
 *      "is_disabled": false
 *    }
 *
 * @apiSuccessExample {json} 200 Unauthenticated Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/USD/accounts/alice",
 *      "name": "alice",
 *      "ledger": "http://usd-ledger.example/USD"
 *    }
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
 * @api {put} /accounts/:name Create or update a user
 * @apiName PutAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Create or update a user. Only admins are allowed to create new accounts.
 *
 * @apiParam {String} name Account's unique identifier
 *
 * @apiExample {shell} Put account
 *    curl -x PUT -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l"
 *    http://usd-ledger.example/USD/accounts/alice
 *
 * @apiSuccessExample {json} 200 Get Account Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://localhost/accounts/alice",
 *      "name": "alice",
 *      "balance": "100",
 *      "is_disabled": false
 *    }
 *
 * @apiUse UnauthorizedError
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
