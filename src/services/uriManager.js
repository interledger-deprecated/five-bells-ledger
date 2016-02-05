const UriManager = require('five-bells-shared/lib/uri-manager').UriManager
const config = require('./config')

const uri = module.exports = new UriManager(config.getIn(['server', 'base_uri']))

uri.addResource('account', '/accounts/:name')
uri.addResource('transfer', '/transfers/:id')
uri.addResource('subscription', '/subscriptions/:id')
