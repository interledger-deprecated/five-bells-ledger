'use strict'

const model = require('../models/messages')

/**
 * @api {post} /messages Send Message
 * @apiName SendMessage
 * @apiGroup Transfer Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Send a message to another account. This is not a reliable delivery mechanism.
 *
 * @apiParam (Request Body) {String} Rejection An error message in string format.
 * @apiParam (Request Body) {Message} Object A Message object to be forwarded to the recipient.
 *
 * @apiExample {shell} Send a Message
 *    curl -X POST -H "Content-Type: application/json" -d \
 *    '{
 *      "ledger": "http://usd-ledger.example",
 *      "account": "http://usd-ledger.example/accounts/bob",
 *      "data": { "foo": "bar" }
 *    }' \
 *    http://usd-ledger.example/messages
 *
 * @apiSuccessExample {json} 201 Message Accepted Response:
 *    HTTP/1.1 201 CREATED
 *
 * @apiUse InvalidBodyError
 */
function * postMessage () {
  const message = this.body
  yield model.sendMessage(message, this.req.user)
  this.status = 201
}

module.exports = { postMessage }
