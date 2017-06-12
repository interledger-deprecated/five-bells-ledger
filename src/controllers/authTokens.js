'use strict'

const model = require('../models/authTokens')
const config = require('../services/config')

/**
 * @api {get} /auth_token Get Auth Token
 * @apiName GetAuthToken
 * @apiGroup Auth Tokens
 * @apiVersion 1.0.0
 *
 * @apiDescription Get a token that can be used to authenticate future requests.
 *
 * @apiExample {shell} Get Auth Token
 *    curl -X GET -H "Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l"
 *    http://usd-ledger.example/auth_token
 *
 * @apiSuccessExample {json} 200 Token Response:
 *    HTTP/1.1 200 OK
 *    Content-Type: application/json
 *
 *    {
 *      "token": "9AtVZPN3t49Kx07stO813UHXv6pcES",
 *      "token_max_age": 604800000
 *    }
 *
 * @apiUse UnauthorizedError
 */
async function getAuthToken (ctx) {
  ctx.body = {
    token: await model.getAuthToken(ctx.state.user),
    token_max_age: config.authTokenMaxAge
  }
}

module.exports = { getAuthToken }
