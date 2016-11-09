'use strict'

const model = require('../models/authTokens')

/**
 * @api {get} /auth_token Get Auth Token
 * @apiName GetAuthToken
 * @apiGroup Auth Tokens
 * @apiVersion 1.0.0
 *
 * @apiDescription Get a token that can be used to authenticate future requests.
 *
 * @apiExample {shell} Send a Message
 *    curl -X GET -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l"
 *    http://usd-ledger.example/auth_token
 *
 * @apiSuccessExample {json} 200 Token Response:
 *    HTTP/1.1 200 OK
 *    Content-Type: application/json
 *
 *    { "token": "9AtVZPN3t49Kx07stO813UHXv6pcES" }
 *
 * @apiUse UnauthorizedError
 */
function * getAuthToken () {
  this.body = {
    token: yield model.getAuthToken(this.req.user)
  }
}

module.exports = { getAuthToken }
