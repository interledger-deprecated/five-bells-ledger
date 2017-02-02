/* @flow */
'use strict'

const request = require('five-bells-shared/utils/request')
const model = require('../models/accounts')
const makeRpcHandler = require('../services/makeRpcHandler')
const uri = require('../services/uriManager')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')

const ACCOUNT_REGISTRATION_REGEX = /^[a-z0-9]([a-z0-9]|[-](?!-)){0,18}[a-z0-9]$/

function * getCollection () {
  this.body = yield model.getAccounts()
}

/**
 * @api {get} /accounts/:name Get Account
 * @apiName GetAccount
 * @apiGroup Account Methods
 * @apiVersion 1.0.0
 *
 * @apiHeader {String} [Authorization] Credentials to access the account. By
 *   default, only the account owner and admin can see details including
 *   account balance.
 * @apiDescription Get information about an account.
 *
 * @apiParam {String} name The unique name for this account.
 *
 * @apiExample {shell} Get account
 *    curl -X GET -H "Authorization: Basic YWxpY2U6YWxpY2U=" http://usd-ledger.example/accounts/alice
 *
 * @apiSuccess (200 OK) {Object} Account The requested
 *   [Account object](#account_object). If the request was
 *   [authenticated](#authentication) as the account owner or an admin, the
 *   response includes additional fields such as the account balance.
 *
 * @apiSuccessExample {json} 200 Authenticated Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/accounts/alice",
 *      "name": "alice",
 *      "balance": "100",
 *      "is_disabled": false
 *    }
 *
 * @apiSuccessExample {json} 200 Unauthenticated Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/accounts/alice",
 *      "name": "alice",
 *      "ledger": "http://usd-ledger.example/USD"
 *    }
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 */
/**
 * @returns {void}
 */
function * getResource () {
  const name = this.params.name
  request.validateUriParameter('name', name, 'Identifier')
  this.body = yield model.getAccount(name.toLowerCase(), this.req.user)
}

/**
 * @api {put} /accounts/:name Create or Update Account
 * @apiName PutAccount
 * @apiGroup Account Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Create or update a user. Only admins are allowed to create new accounts.
 *
 * @apiParam {String} name Account's unique identifier
 *
 * @apiExample {shell} Put account
 *    curl -X PUT -H "Authorization: Basic YWxpY2U6YWxpY2U=" \
 *    -H "Content-Type: application/json" \
 *    -d '{"name": "alice", "balance": "100"}' \
 *    http://usd-ledger.example/accounts/alice
 *
 * @apiSuccess (201 Created) {Object} Account The newly-created
 *   [Account object](#account_object), as saved.
 *
 * @apiSuccess (200 OK) {Object} Account The updated
 *   [Account object](#account_object), as saved.
 *
 * @apiSuccessExample {json} 200 Get Account Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/accounts/alice",
 *      "name": "alice",
 *      "balance": "100",
 *      "is_disabled": false
 *    }
 *
 * @apiUse UnauthorizedError
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 */
/**
 * @return {void}
 */
function * putResource () {
  const name = this.params.name
  request.validateUriParameter('name', name, 'Identifier')
  const account = this.body
  if (account.id) {
    request.assert.strictEqual(account.id,
      uri.make('account', name),
      'Account id must match the URL')
  }
  if (account.name) {
    request.assert.strictEqual(account.name, name,
      'Account name must match the one in the URL')
  }
  if (!ACCOUNT_REGISTRATION_REGEX.test(account.name)) {
    throw new InvalidBodyError('Account name must be 2-20 characters, lowercase letters, numbers and hyphens ("-") only, with no two or more consecutive hyphens.')
  }
  const result = yield model.setAccount(account, this.req.user)
  this.body = result.account
  this.status = result.existed ? 200 : 201
}

/**
 * @api {get} /websocket [Websocket] Subscribe to Account Notifications
 * @apiName SubscribeAccountNotifications
 * @apiGroup Account Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Subscribe to an account's real-time notifications via WebSocket.
 *
 * @apiExample {shell} Subscribe to account transfers
 *    wscat --auth alice:alice -c ws://usd-ledger.example/websocket
 *
 * @apiSuccess (101 Switching Protocols) {None} ... This methods opens a
 *    WebSocket connection with the server. There is no immediate response
 *    after opening the connection.
 *
 * @apiSuccess (Additional Messages) {Object} RpcRequest or RpcResponse; Notifications about
 *   the change in the state of any transfer that affects this account.
 *
 * @apiSuccessExample {json} Initial connection
 *    HTTP/1.1 101 Switching Protocols
 *
 * @apiSuccessExample {json} On connect
 *    {
 *      "jsonrpc": "2.0",
 *      "id": null,
 *      "method": "connect"
 *    }
 *
 * @apiSuccessExample {json} Push transfer notification
 *    {
 *      "jsonrpc": "2.0",
 *      "id": null,
 *      "method": "notify",
 *      "params": {
 *        "event": "transfer.update",
 *        "resource":{
 *          "debits":[
 *            {
 *              "account":"http://usd-ledger.example/accounts/alice",
 *              "amount":"0.01",
 *              "authorized":true
 *            }
 *          ],
 *          "credits":[
 *            {
 *              "account":"http://usd-ledger.example/accounts/bob",
 *              "amount":"0.01"
 *            }
 *          ],
 *          "id":"http://usd-ledger.example/transfers/4f122511-989d-101e-f938-573993b75e22",
 *          "ledger":"http://usd-localhost.example",
 *          "state":"executed",
 *          "timeline":{
 *            "proposed_at":"2016-04-27T17:57:27.037Z",
 *            "prepared_at":"2016-04-27T17:57:27.054Z",
 *            "executed_at":"2016-04-27T17:57:27.060Z"
 *          }
 *        }
 *      }
 *    }
 *
 * @apiSuccessExample {json} Push message notification
 *    {
 *      "jsonrpc": "2.0",
 *      "id": null,
 *      "method": "notify",
 *      "params": {
 *        "event": "message.send",
 *        "resource":{
 *          "ledger": "http://usd-localhost.example",
 *          "from": "http://usd-localhost.example/accounts/alice",
 *          "to": "http://usd-localhost.example/accounts/bob",
 *          "data": { "foo": "bar" }
 *        }
 *      }
 *    }
 *
 * @apiExample {json} Subscribe account (request)
 *    {
 *      "jsonrpc": "2.0",
 *      "id": 1,
 *      "method": "subscribe_account",
 *      "params": {
 *        "eventType": "*",
 *        "accounts": ["http://usd-ledger.example/accounts/alice"]
 *      }
 *    }
 *
 * @apiSuccessExample {json} Subscribe account (response)
 *    {
 *      "jsonrpc": "2.0",
 *      "id": 1,
 *      "result": 1
 *    }
 *
 * @apiErrorExample {json} Subscribe account (response)
 *    {
 *      "jsonrpc": "2.0",
 *      "id": 1,
 *      "error": {
 *        "code": 4000,
 *        "message": "RpcError",
 *        "data": "Invalid id"
 *      }
 *    }
 */
/**
 * @return {void}
 */
function * subscribeTransfers () {
  // The websocket is already closed, so don't subscribe.
  if (this.websocket.readyState !== 1) return
  makeRpcHandler(this.websocket, this.req.user)
}

module.exports = {
  getCollection,
  getResource,
  putResource,
  subscribeTransfers
}
