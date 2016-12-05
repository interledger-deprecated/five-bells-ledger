'use strict'

const log = require('./log')
const RpcHandler = require('../lib/rpcHandler')
const config = require('./config')

module.exports = function (websocket, requestingUser) {
  return new RpcHandler({
    log: log.create('rpcHandler'),
    uriManager: require('./uriManager'),
    validator: require('./validator'),
    notificationBroadcaster: require('./notificationBroadcaster'),
    pingInterval: config.websocket.pingInterval
  }, websocket, requestingUser)
}
