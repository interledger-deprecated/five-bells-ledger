'use strict'
const config = require('../services/config')

const metadata = {
  currency_code: config.getIn(['currency', 'code']),
  currency_symbol: config.getIn(['currency', 'symbol']),
  condition_sign_public_key: config.getIn(['keys', 'ed25519', 'public']),
  notification_sign_public_key: config.getIn(['keys', 'notification_sign', 'public']),
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
