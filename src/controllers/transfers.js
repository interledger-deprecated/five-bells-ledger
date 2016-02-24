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
 * @apiExample {shell} Get a transfer
 *   curl -x GET http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204
 *
 * @apiSuccessExample {json} Transfer Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example/USD",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/alice",
 *        "amount": "50"
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
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "executed",
 *      "timeline": {
 *        "proposed_at": "2015-06-16T00:00:00.000Z",
 *        "prepared_at": "2015-06-16T00:00:00.500Z",
 *        "executed_at": "2015-06-16T00:00:00.999Z"
 *      }
 *    }
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
 *   If the transfer doesn't exist it will have the state `"nonexistent"`.
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 * @apiParam {String} type The signature type
 * @apiParam {String} condition_state The state to hash for preimage algorithms' conditions.
 *
 * @apiExample {shell} Get a transfer state receipt
 *   curl -x GET http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/state
 *
 * @apiSuccessExample {json} Transfer State Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "message":
 *        {
 *          "id": "http://localhost/transfers/03b7c787-e104-4390-934e-693072c6eda2",
 *          "state": "nonexistent"
 *        },
 *      "type": "ed25519-sha512",
 *      "signer": "http://localhost",
 *      "public_key": "9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0=",
 *      "signature": "DPHsnt3/5gskzs+tF8LNne/3p9ZqFFWNO+mvUlol8geh3VeErLE3o3bKkiSLg890/SFIeUDtvHL3ruiZRcOFAQ=="
 *    }
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
 * @api {put} /transfers/:id Propose and prepare a transfer
 * @apiName PutTransfer
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription This endpoint is used to create and authorize transfers.
 *    When a transfer is created without authorization from the debited accounts
 *    it is in the `"proposed"` state. To authorize the transfer, the owner of the
 *    debited accounts must put the `"authorized": true` flag on the debit referencing
 *    their account and this HTTP call must carry HTTP authorization. When all
 *    debited accounts have authorized the transfer it is `"prepared"` and funds are escrowed
 *    until the fulfillment is presented or the `expires_at` time is reached
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiExample {shell} Propose a Transfer:
 *    curl -x PUT -H "Content-Type: application/json" -d
 *    '{
 *      "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example/USD",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/alice",
 *        "amount": "50"
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
 *      "expires_at": "2015-06-16T00:00:01.000Z"
 *    }'
 *    http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204
 *
 * @apiSuccessExample {json} 201 New Proposed Transfer Response:
 *    HTTP/1.1 201 CREATED
 *    {
 *      "id": "http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example/USD",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/USD/accounts/alice",
 *        "amount": "50"
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
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "proposed"
 *    }
 *
 * @apiExample {shell} Prepare a Transfer:
 *    curl -x PUT -H "Content-Type: application/json Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l" -d
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
 *      "expires_at": "2015-06-16T00:00:01.000Z"
 *    }'
 *    http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204
 *
 * @apiSuccessExample {json} 200 Prepared Transfer Response:
 *    HTTP/1.1 200 OK
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
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "prepared"
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

/**
 * @api {put} /transfers/:id/fulfillment Execute a prepared transfer
 * @apiName PutTransferFulfillment
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription Execute or cancel a transfer that has already been prepared.
 *    Putting the fulfillment of either the `execution_condition` or the
 *    `cancellation_condition`, if there is one, will execute or cancel the transfer, respectively.
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiExample {shell} Put Transfer Fulfillment:
 *    curl -x PUT -H "Content-Type: application/json" -d
 *    '{
 *      "type": "ed25519-sha512",
 *      "signature":
 *      "sd0RahwuJJgeNfg8HvWHtYf4uqNgCOqIbseERacqs8G0kXNQQnhfV6gWAnMb+0RIlY3e0mqbrQiUwbRYJvRBAw=="
 *    }'
 *    http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/fulfillment
 *
 * @apiSuccessExample {json} 201 Fulfillment Accepted Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "type": "ed25519-sha512",
 *      "signature":
 *      "sd0RahwuJJgeNfg8HvWHtYf4uqNgCOqIbseERacqs8G0kXNQQnhfV6gWAnMb+0RIlY3e0mqbrQiUwbRYJvRBAw=="
 *    }
 *
 * @apiUse UnmetConditionError
 * @apiUse UnprocessableEntityError
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 *
 * @param {String} id Transfer UUID
 * @returns {void}
 */
function * putFulfillment () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const fulfillment = this.body
  fulfillment.setTransferId(id)
  const result = yield model.fulfillTransfer(id, fulfillment)
  this.body = result.fulfillment
  this.status = result.existed ? 200 : 201
}

/**
 * @api {get} /transfers/:id/fulfillment Get a transfer's fulfillment
 * @apiName GetTransferFulfillment
 * @apiGroup Transfer
 * @apiVersion 1.0.0
 *
 * @apiDescription Retrieve the fulfillment for a transfer that has been executed or cancelled
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiExample {shell} Get Transfer Fulfillment:
 *    curl -x GET
 *    http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/fulfillment
 *
 * @apiSuccessExample {json} 200 Fulfillment Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "type": "ed25519-sha512",
 *      "signature":
 *      "sd0RahwuJJgeNfg8HvWHtYf4uqNgCOqIbseERacqs8G0kXNQQnhfV6gWAnMb+0RIlY3e0mqbrQiUwbRYJvRBAw=="
 *    }
 *
 * @apiUse NotFoundError
 *
 * @param {String} id Transfer UUID
 * @returns {void}
 */
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
