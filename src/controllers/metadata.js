'use strict'
const config = require('../services/config')

const metadata = {
  currency_code: config.getIn(['currency', 'code']),
  currency_symbol: config.getIn(['currency', 'symbol']),
  public_key: config.getIn(['keys', 'ed25519', 'public']),
  urls: {
    health: '/health',
    transfer: '/transfers/:id',
    transfer_fulfillment: '/transfers/:id/fulfillment',
    transfer_state: '/transfers/:id/state',
    connectors: '/connectors',
    accounts: '/accounts',
    account: '/accounts/:name',
    subscription: '/subscriptions/:id',
    subscription_notification: '/subscriptions/:subscription_id/notifications/:notification_id'
  }
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
