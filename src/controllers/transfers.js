/* @flow */
'use strict'

const _ = require('lodash')
const requestUtil = require('five-bells-shared/utils/request')
const model = require('../models/transfers')
const InvalidUriParameterError = require('five-bells-shared/errors/invalid-uri-parameter-error')

/**
 * @api {get} /transfers/:id Get local transfer object
 * @apiName GetTransfer
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details or status of a local
 *   transfer.
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 *
 * @returns {void}
 */
function * getResource () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  this.body = yield model.getTransfer(id.toLowerCase())
}

/**
 * @api {get} /transfers/:id/state Get the state of a transfer
 * @apiName GetTransferState
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to get a signed receipt containing only the id of
 *   transfer and its state. It functions even if the transfer doesn't exist yet.
 *   If the transfer doesn't exist it will have the state "nonexistent".
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 * @apiParam {String} type The signature type
 * @apiParam {String} condition_state The state to hash for preimage algorithms' conditions.
 *
 * @apiUse InvalidUriParameterError
 *
 * @returns {void}
 */
function * getStateResource () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const conditionState = this.query.condition_state
  const signatureType = this.query.type || 'ed25519-sha512'
  const signatureTypes = ['ed25519-sha512', 'sha256']
  if (!_.includes(signatureTypes, signatureType)) {
    throw new InvalidUriParameterError('type is not valid')
  }
  this.body = yield model.getTransferStateReceipt(
    id.toLowerCase(), signatureType, conditionState)
}

/**
 * @api {put} /transfers/:id Make a local transfer
 * @apiName PutTransfer
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiExample {shell} Basic Transfer:
 *    curl -x PUT -H "Content-Type: application/json" -d
 *    '{
 *      "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example/USD",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/alice",
 *        "amount": "50",
 *        "authorized": true
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": {
 *        "message_hash": "claZQU7qkFz7smkAVtQp9ekUCc5LgoeN9W3RItIzykNEDbGSvzeHvOk9v/vrPpm+XWx5VFjd/sVbM2SLnCpxLw==",
 *        "signer": "http://ledger.example",
 *        "type": "ed25519-sha512",
 *        "public_key": "Lvf3YtnHLMER+VHT0aaeEJF+7WQcvp4iKZAdvMVto7c="
 *      },
 *      "execution_condition_fulfillment": {
 *        "type": "ed25519-sha512",
 *        "signature": "sd0RahwuJJgeNfg8HvWHtYf4uqNgCOqIbseERacqs8G0kXNQQnhfV6gWAnMb+0RIlY3e0mqbrQiUwbRYJvRBAw=="
 *      },
 *      "expires_at": "2015-06-16T00:00:01.000Z"
 *    }'
 *    https://trader.example/payments/c9377529-d7df-4aa1-ae37-ad5148612003
 *
 * @apiSuccessExample {json} 201 New Transfer Response:
 *    HTTP/1.1 201 CREATED
 *    {
 *      "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example/USD",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/alice",
 *        "amount": "50",
 *        "authorized": true
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": {
 *        "message_hash": "claZQU7qkFz7smkAVtQp9ekUCc5LgoeN9W3RItIzykNEDbGSvzeHvOk9v/vrPpm+XWx5VFjd/sVbM2SLnCpxLw==",
 *        "signer": "http://ledger.example",
 *        "type": "ed25519-sha512",
 *        "public_key": "Lvf3YtnHLMER+VHT0aaeEJF+7WQcvp4iKZAdvMVto7c="
 *      },
 *      "execution_condition_fulfillment": {
 *        "type": "ed25519-sha512",
 *        "signature": "sd0RahwuJJgeNfg8HvWHtYf4uqNgCOqIbseERacqs8G0kXNQQnhfV6gWAnMb+0RIlY3e0mqbrQiUwbRYJvRBAw=="
 *      },
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "executed"
 *    }
 *
 * @apiUse InsufficientFundsError
 * @apiUse UnprocessableEntityError
 * @apiUse AlreadyExistsError
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 *
 * @param {String} id Transfer UUID
 * @returns {void}
 */
function * putResource () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const transfer = this.body

  if (typeof transfer.id !== 'undefined') {
    requestUtil.assert.strictEqual(
      transfer.id.toLowerCase(),
      id.toLowerCase(),
      'Transfer ID must match the URI'
    )
  }

  transfer.id = id.toLowerCase()
  const result = yield model.setTransfer(transfer, this.req.user)
  this.body = result.transfer
  this.status = result.existed ? 200 : 201
}

function * putFulfillment () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const fulfillment = this.body
  const result = yield model.fulfillTransfer(id, fulfillment)
  this.body = result.fulfillment
  this.status = result.existed ? 200 : 201
}

function * getFulfillment () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  this.body = yield model.getFulfillment(id.toLowerCase())
}

module.exports = {
  getResource,
  getStateResource,
  putResource,
  putFulfillment,
  getFulfillment
}
