'use strict'

const accounts = require('../models/accounts')

/**
 * @api {get} / Get Server Metadata
 * @apiName GetMetadata
 * @apiGroup Metadata Methods
 * @version 1.0.0
 *
 * @apiDescription This endpoint will return server metadata.
 * @apiExample {shell} Get Metadata
 *    curl http://usd-ledger.example/
 *
 * @apiSuccess (200 OK) {String} [currency_code] Three-letter ([ISO 4217](http://www.xe.com/iso4217.php)) code of the currency this ledger tracks.
 * @apiSuccess (200 OK) {String} [currency_symbol] Currency symbol to use in user interfaces for the currency represented in this ledger. For example, "$".
 * @apiSuccess (200 OK) {Integer} precision How many total decimal digits of precision this ledger uses to represent currency amounts.
 * @apiSuccess (200 OK) {Integer} scale How many digits after the decimal place this ledger supports in currency amounts.
 * @apiSuccess (200 OK) {Object} urls Paths to other methods exposed by this ledger
 * @apiSuccess (200 OK) {(Various)} ... The ledger may report additional arbitrary parameters as desired.
 *
 * @apiSuccessExample {json} 200 OK
 *    HTTP/1.1 200 OK
 *
 *    {
 *        "currency_code": null,
 *        "currency_symbol": null,
 *        "condition_sign_public_key": "YNDefwo4LB+AjkCRzuCSGuAlDLvSCWUxPRX7lXLhV1I=",
 *        "urls": {
 *            "health": "http://usd-ledger.example/health",
 *            "transfer": "http://usd-ledger.example/transfers/:id",
 *            "transfer_fulfillment": "http://usd-ledger.example/transfers/:id/fulfillment",
 *            "transfer_rejection": "http://usd-ledger.example/transfers/:id/rejection",
 *            "transfer_state": "http://usd-ledger.example/transfers/:id/state",
 *            "accounts": "http://usd-ledger.example/accounts",
 *            "account": "http://usd-ledger.example/accounts/:name",
 *            "auth_token": "http://usd-ledger.example/auth_token",
 *            "websocket": "ws://usd-ledger.example/websocket",
 *            "message": "http://usd-ledger.example/messages"
 *        },
 *        "precision": 10,
 *        "scale": 2,
 *        "connectors": [
 *            {
 *                "id": "http://usd-ledger.example/accounts/chloe",
 *                "name": "chloe"
 *            }
 *        ]
 *    }
 */
/*
 * @returns {void}
 */
module.exports = (config) => {
  const base = config.getIn(['server', 'base_uri'])
  const metadata = {
    currency_code: config.getIn(['currency', 'code']),
    currency_symbol: config.getIn(['currency', 'symbol']),
    ilp_prefix: config.getIn(['ilp', 'prefix']),
    condition_sign_public_key: config.getIn(['keys', 'ed25519', 'public']),
    urls: {
      health: base + '/health',
      transfer: base + '/transfers/:id',
      transfer_fulfillment: base + '/transfers/:id/fulfillment',
      transfer_rejection: base + '/transfers/:id/rejection',
      transfer_state: base + '/transfers/:id/state',
      accounts: base + '/accounts',
      account: base + '/accounts/:name',
      auth_token: base + '/auth_token',
      websocket: base.replace(/^http/, 'ws') + '/websocket',
      message: base + '/messages'
    },
    precision: config.get('amount.precision'),
    scale: config.get('amount.scale')
  }

  try {
    metadata.version = `five-bells@${require('../../package.json').version.split('.')[0]}`
  } catch (e) {
  }

  return {
    getResource: async function (ctx) {
      ctx.body = Object.assign({
        connectors: await accounts.getConnectors(config)
      }, metadata)
    }
  }
}
