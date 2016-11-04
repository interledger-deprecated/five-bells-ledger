/* @flow */
'use strict'

const _ = require('lodash')
const uri = require('../services/uriManager')
const parse = require('co-body')
const requestUtil = require('five-bells-shared/utils/request')
const model = require('../models/transfers')
const InvalidUriParameterError = require('five-bells-shared/errors/invalid-uri-parameter-error')

/**
 * @api {get} /transfers/:id Get Transfer by ID
 * @apiName GetTransfer
 * @apiGroup Transfer Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Use this to query about the details or status of a local
 *   transfer.
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiExample {shell} Get a transfer
 *   curl -X GET http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204
 *
 * @apiSuccess (Success) {Transfer} Object The [Transfer object](#transfer_object) as saved.
 *
 * @apiSuccessExample {json} Transfer Response:
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/accounts/alice",
 *        "amount": "50"
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": "cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2",
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
 */
/**
 * @returns {void}
 */
function * getResource () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  this.body = yield model.getTransfer(id.toLowerCase())
}

/**
 * @api {get} /transfers/byExecutionCondition/:execution_condition Get Transfers by Condition
 * @apiName GetTransferByExecutionCondition
 * @apiGroup Transfer Methods
 * @apiVersion 15.0.0
 *
 * @apiDescription Use this to query about the details or status of a local
 *   transfer that is using atomic mode.
 *
 * @apiParam {String} execution_condition
 *
 * @apiExample {shell} Get a transfer
 *   curl -X GET http://usd-ledger.example/transfers/ByExecutionCondition/cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2
 *
 * @apiSuccess (Success) {Transfer[]} Array Array of [Transfer objects](#transfer_object) matching the condition.
 *
 * @apiSuccessExample {Array} Array of Transfer responses:
 *    HTTP/1.1 200 OK
 *    [{
 *      "id": "http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/accounts/alice",
 *        "amount": "50"
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": "cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2",
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "executed",
 *      "timeline": {
 *        "proposed_at": "2015-06-16T00:00:00.000Z",
 *        "prepared_at": "2015-06-16T00:00:00.500Z",
 *        "executed_at": "2015-06-16T00:00:00.999Z"
 *      }
 *    }]
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 */
/**
 * @returns {void}
 */
function * getResourcesByExecutionCondition () {
  const executionConditon = this.params.execution_condition
  requestUtil.validateUriParameter('execution_condition', executionConditon, 'Condition')
  this.body = yield model.getTransfersByExecutionCondition(executionConditon)
}

/**
 * @api {get} /transfers/:id/state Get Signed Transfer State
 * @apiName GetTransferState
 * @apiGroup Transfer Methods
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
 *   curl -X GET http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/state
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
 */
/**
 * @returns {void}
 */
function * getStateResource () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const conditionState = this.query.condition_state
  const receiptType = this.query.type || 'ed25519-sha512'
  const receiptTypes = ['ed25519-sha512', 'sha256']
  if (!_.includes(receiptTypes, receiptType)) {
    throw new InvalidUriParameterError('type is not valid')
  }
  this.body = yield model.getTransferStateReceipt(
    id.toLowerCase(), receiptType, conditionState)
}

/**
 * @api {put} /transfers/:id Propose or Prepare Transfer
 * @apiName PutTransfer
 * @apiGroup Transfer Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Creates or updates a Transfer object. The transfer is
 *    "proposed" if it contains debits that do not have `"authorized": true`.
 *    To set the `authorized` field, call this method
 *    [authenticated](#authentication) as owner of the account to be debited,
 *    or as an admin. The transfer is "prepared" when all debits have been
 *    authorized. When a transfer becomes prepared, it executes immediately if
 *    there is no condition. If an `execution_condition` is specified, the
 *    funds are held until a
 *    [matching fulfillment is submitted](#api-Transfer_Methods-PutTransferFulfillment)
 *    or the `expires_at` time is reached.
 *
 * @apiParam (URL Params) {String} id A new
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier)
 *   to identify this Transfer.
 *
 * @apiParam (Request Body) {Transfer} Object A [Transfer object](#transfer_object) to
 *    describe the transfer that should take place. For a conditional transfer, this
 *    includes an `execution_condition`. The `authorized` field of each debit object
 *    must be set to `true` before the transfer can occur.
 *
 * @apiExample {shell} Propose a Transfer
 *    curl -X PUT -H "Content-Type: application/json" -d \
 *    '{
 *      "id": "http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/accounts/alice",
 *        "amount": "50"
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": "cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2",
 *      "expires_at": "2015-06-16T00:00:01.000Z"
 *    }' \
 *    http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204
 *
 * @apiHeader {String} Content-Type Must be `application/json`.
 * @apiHeader {String} [Authorization] To control the `authorized` field of a
 *   debit, the user must be [authenticated](#authentication).
 * @apiSuccess (201 Created) {Transfer} Object The newly-created
 *   [Transfer object](#transfer_object) as saved.
 * @apiSuccess (200 OK) {Transfer} Object The updated
 *   [Transfer object](#transfer_object) as saved.
 *
 * @apiSuccessExample {json} 201 New Proposed Transfer Response
 *    HTTP/1.1 201 CREATED
 *    {
 *      "id": "http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/accounts/alice",
 *        "amount": "50"
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": "cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2",
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "proposed"
 *    }
 *
 * @apiExample {shell} Prepare a Transfer
 *    curl -X PUT -H "Content-Type: application/json" -H "Authorization: Basic YWxpY2U6YWxpY2U=" -d \
 *    '{
 *      "id": "http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/accounts/alice",
 *        "amount": "50",
 *        "authorized": true
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": "cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2",
 *      "expires_at": "2015-06-16T00:00:01.000Z"
 *    }' \
 *    http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204
 *
 * @apiSuccessExample {json} 200 Prepared Transfer Response
 *    HTTP/1.1 200 OK
 *    {
 *      "id": "http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
 *      "ledger": "http://usd-ledger.example",
 *      "debits": [{
 *        "account": "http://usd-ledger.example/accounts/alice",
 *        "amount": "50",
 *        "authorized": true
 *      }],
 *      "credits": [{
 *        "account": "http://usd-ledger.example/accounts/bob",
 *        "amount": "50"
 *      }],
 *      "execution_condition": "cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2",
 *      "expires_at": "2015-06-16T00:00:01.000Z",
 *      "state": "prepared"
 *    }
 *
 * @apiUse InsufficientFundsError
 * @apiUse UnprocessableEntityError
 * @apiUse AlreadyExistsError
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 */
/**
 * @param {String} id Transfer UUID
 * @returns {void}
 */
function * putResource () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const transfer = this.body

  if (typeof transfer.id !== 'undefined') {
    requestUtil.assert.strictEqual(
      uri.parse(transfer.id, 'transfer').id.toLowerCase(),
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
 * @api {put} /transfers/:id/fulfillment Execute Prepared Transfer
 * @apiName PutTransferFulfillment
 * @apiGroup Transfer Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Execute or cancel a transfer that has already been prepared.
 *    If the prepared transfer has an `execution_condition`, you can submit the
 *    fulfillment of that condition to execute the transfer. If the prepared
 *    transfer has a `cancellation_condition`, you can submit the fulfillment
 *    of that condition to cancel the transfer.
 *
 * @apiHeader {String} Content-Type Must be `text/plain`.
 * @apiParam (URL Parameters) {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 * @apiParam (Request Body) {String} Fulfillment A [Fulfillment](#cryptoconditions)
 *   in string format.
 *
 * @apiExample {shell} Put Transfer Fulfillment:
 *    curl -X PUT -H "Content-Type: text/plain" -d \
 *    'cf:0:_v8' \
 *    http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/fulfillment
 *
 * @apiSuccessExample {json} 200 Fulfillment Accepted Response:
 *    HTTP/1.1 200 OK
 *    cf:0:_v8
 *
 * @apiUse UnmetConditionError
 * @apiUse UnprocessableEntityError
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 */
/**
 * @param {String} id Transfer UUID
 * @returns {void}
 */
function * putFulfillment () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const fulfillment = yield parse.text(this)
  const result = yield model.fulfillTransfer(id, fulfillment)
  this.body = result.fulfillment
  this.status = result.existed ? 200 : 201
}

/**
 * @api {get} /transfers/:id/fulfillment Get Transfer Fulfillment
 * @apiName GetTransferFulfillment
 * @apiGroup Transfer Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Retrieve the fulfillment for a transfer that has been executed or cancelled. This is separate from the Transfer object because it can be very large.
 *
 * @apiParam {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 *
 * @apiExample {shell} Get Transfer Fulfillment:
 *    curl -X GET
 *    http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/fulfillment
 *
 * @apiSuccessExample {json} 200 Fulfillment Response:
 *    HTTP/1.1 200 OK
 *    cf:0:_v8
 *
 * @apiUse NotFoundError
 */
/**
 * @param {String} id Transfer UUID
 * @returns {void}
 */
function * getFulfillment () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  this.body = yield model.getFulfillment(id.toLowerCase())
}

/**
 * @api {put} /transfers/:id/rejection Reject Transfer
 * @apiName PutTransferRejection
 * @apiGroup Transfer Methods
 * @apiVersion 1.0.0
 *
 * @apiDescription Reject the transfer with the given message
 *
 * @apiHeader {String} Content-Type Must be `text/plain`.
 * @apiParam (URL Parameters) {String} id Transfer
 *   [UUID](http://en.wikipedia.org/wiki/Universally_unique_identifier).
 * @apiParam (Request Body) {String} Rejection An error message in string format.
 *
 * @apiExample {shell} Put Transfer Rejection:
 *    curl -X PUT -H "Content-Type: text/plain" -d \
 *    'an error'
 *    http://usd-ledger.example/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/rejection
 *
 * @apiSuccessExample {json} 200 Rejection Accepted Response:
 *    HTTP/1.1 200 OK
 *    'an error'
 *
 * @apiUse UnprocessableEntityError
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 */
/**
 * @param {String} id Transfer UUID
 * @returns {void}
 */
function * putRejection () {
  const id = this.params.id
  requestUtil.validateUriParameter('id', id, 'Uuid')
  const rejectionMessage = yield parse.text(this)
  const result = yield model.rejectTransfer(id, rejectionMessage, this.req.user)
  this.body = result.rejection
  this.status = result.existed ? 200 : 201
}

module.exports = {
  getResource,
  getResourcesByExecutionCondition,
  getStateResource,
  putResource,
  putFulfillment,
  getFulfillment,
  putRejection
}
