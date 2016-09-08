'use strict'

const accounts = require('../models/accounts')

/**
 * @api {get} / Get Server Metadata
 * @apiName GetMetadata
 * @apiGroup Metadata Methods
 * @apiVersion 1.0.0
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
 *        "notification_sign_public_key": "-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEAnR0o5RIONZy8zwKNxt8ibQtuIu+VDgcZB5MFzFywEvhNFAMXJZyq2ZgER2fb\nXJGfT0CAOMLa3TNcPHvhdHCOnkHSqs7SRLnjnGJuxv/+WyNaFuzrgUT4ymBdtK2LT5j1p7uw\nllxUv9uAjWRz96LUQewjXl38QxE56rp5ov+O+frF2TDN+qFLqgRX1N6kbY6roQRDJ3BFKKqN\nS3mVqMqokeQ5UmYwqAcgmdysoFZFcCkuRdZ1Han/CMDfnhL0mtQmwOhUdOZ4a6dfWNgozycI\nyQOS59ckDp31dRjMZddaSQki/yDIAxmtZHzE4z+U4ZMxEbirwCZbA9QZed2Tu35yQwIDAQAB\n-----END RSA PUBLIC KEY-----\n",
 *        "urls": {
 *            "health": "http://usd-ledger.example/health",
 *            "transfer": "http://usd-ledger.example/transfers/:id",
 *            "transfer_fulfillment": "http://usd-ledger.example/transfers/:id/fulfillment",
 *            "transfer_state": "http://usd-ledger.example/transfers/:id/state",
 *            "connectors": "http://usd-ledger.example/connectors",
 *            "accounts": "http://usd-ledger.example/accounts",
 *            "account": "http://usd-ledger.example/accounts/:name",
 *            "subscription": "http://usd-ledger.example/subscriptions/:id",
 *            "subscription_notification": "http://usd-ledger.example/subscriptions/:subscription_id/notifications/:notification_id"
 *        },
 *        "precision": 10,
 *        "scale": 2,
 *        "connectors": [
 *            {
 *                "id": "http://usd-ledger.example/accounts/chloe",
 *                "name": "chloe",
 *                "connector": "http://usd-eur-connector.example"
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
    notification_sign_public_key: config.getIn(['keys', 'notification_sign', 'public']),
    urls: {
      health: base + '/health',
      transfer: base + '/transfers/:id',
      transfer_fulfillment: base + '/transfers/:id/fulfillment',
      transfer_state: base + '/transfers/:id/state',
      connectors: base + '/connectors',
      accounts: base + '/accounts',
      account: base + '/accounts/:name',
      subscription: base + '/subscriptions/:id',
      subscription_notification: base + '/subscriptions/:subscription_id/notifications/:notification_id'
    },
    precision: config.get('amount.precision'),
    scale: config.get('amount.scale')
  }

  return {
    getResource: function * () {
      this.body = Object.assign({
        connectors: yield accounts.getConnectors()
      }, metadata)
    }
  }
}
