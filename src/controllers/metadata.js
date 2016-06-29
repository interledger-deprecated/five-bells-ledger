'use strict'
const config = require('../services/config')

const base = config.getIn(['server', 'base_uri'])
const metadata = {
  currency_code: config.getIn(['currency', 'code']),
  currency_symbol: config.getIn(['currency', 'symbol']),
  condition_sign_public_key: config.getIn(['keys', 'ed25519', 'public']),
  notification_sign_public_key: config.getIn(['keys', 'notification_sign', 'public']),
  urls: {
    health: base + '/health',
    transfer: base + '/transfers/:id',
    transfer_fulfillment: base + '/transfers/:id/fulfillment',
    transfer_state: base + '/transfers/:id/state',
    connectors: base + '/connectors',
    accounts: base + '/accounts',
    account: base + '/accounts/:name'
  },
  precision: config.get('amount.precision'),
  scale: config.get('amount.scale')
}

/**
 * @api {get} / Get the server metadata
 * @apiName GetMetadata
 * @apiGroup Metadata
 * @apiVersion 1.0.0
 *
 * @apiDescription This endpoint will return server metadata.
 *
 * @returns {void}
 */
exports.getResource = function * () { this.body = metadata }
