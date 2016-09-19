/* @flow */
'use strict'

const request = require('five-bells-shared/utils/request')
const model = require('../models/accounts')

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
 *    curl -X GET -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l"
 *    http://usd-ledger.example/accounts/alice
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
 *    curl -X PUT -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l"
 *    -H "Content-Type: application/json"
 *    -d '{"name": "alice", "balance": "100"}'
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
 *      "id": "http://usd-ledger.exmaple/accounts/alice",
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
  if (account.name) {
    request.assert.strictEqual(account.name.toLowerCase(), name.toLowerCase(),
      'Account name must match the one in the URL')
  }
  const result = yield model.setAccount(account, this.req.user)
  this.body = result.account
  this.status = result.existed ? 200 : 201
}

/**
 * @api {get} /accounts/:name/transfers [Websocket] Subscribe to Account Transfers
 * @apiName SubscribeAccountTransfers
 * @apiGroup Account Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Subscribe to an account's transfers and receive real-time
 *   notifications via WebSocket.
 *
 * @apiParam {String} name Account's unique identifier
 *
 * @apiExample {shell} Subscribe to account transfers
 *    wscat --auth alice:alice -c ws://usd-ledger.example/accounts/alice/transfers
 *
 * @apiSuccess (101 Switching Protocols) {None} ... This methods opens a
 *    WebSocket connection with the server. There is no immediate response
 *    after opening the connection.
 *
 * @apiSuccess (Additional Messages) {Object} Notification At most one
 *   [notification object](#notification_object) for each change in the state
 *   of any transfer that affects this account. This includes transfers that
 *   debit or credit the account.
 *
 * @apiSuccessExample {json} Initial connection
 *    HTTP/1.1 101 Switching Protocols
 *
 * @apiSuccessExample {json} Push notification
 *    {
 *      "resource":{
 *        "debits":[
 *          {
 *            "account":"http://usd-ledger.exmaple/accounts/alice",
 *            "amount":"0.01",
 *            "authorized":true
 *          }
 *        ],
 *        "credits":[
 *          {
 *            "account":"http://usd-ledger.exmaple/accounts/bob",
 *            "amount":"0.01"
 *          }
 *        ],
 *        "id":"http://usd-ledger.exmaple/transfers/4f122511-989d-101e-f938-573993b75e22",
 *        "ledger":"http://localhost",
 *        "state":"executed",
 *        "timeline":{
 *          "proposed_at":"2016-04-27T17:57:27.037Z",
 *          "prepared_at":"2016-04-27T17:57:27.054Z",
 *          "executed_at":"2016-04-27T17:57:27.060Z"
 *        }
 *      }
 *    }
 *
 * @apiUse UnauthorizedError
 * @apiUse InvalidUriParameterError
 */
/**
 * @return {void}
 */
function * subscribeTransfers () {
  const name = this.params.name
  if (!(name === '*' && this.req.user.is_admin)) {
    request.validateUriParameter('name', name, 'Identifier')
  }

  // The websocket is already closed, so don't subscribe.
  if (this.websocket.readyState !== 1) return

  const close = model.subscribeTransfers(name, this.req.user, (notification) => {
    this.websocket.send(JSON.stringify(notification))
  })

  this.websocket.on('close', close)
}

module.exports = {
  getCollection,
  getResource,
  putResource,
  subscribeTransfers
}
