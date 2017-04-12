'use strict'

const url = require('url')
const compose = require('koa-compose')
const WebSocketServer = require('ws').Server
const log = require('../services/log').create('koa-websocket')

// If MAX_PAYLOAD is too high, the ledger may slow down or run out of memory.
// If it is too low, valid messages will be discarded.
const MAX_PAYLOAD = 64 * 1024

// Originally from https://github.com/kudos/koa-websocket
// Modified to set custom `maxPayload` and fix crash in `onConnection`.
class KoaWebSocketServer {
  constructor (app) {
    this.app = app
    this.middleware = []
  }

  listen (server) {
    this.server = new WebSocketServer({server, maxPayload: MAX_PAYLOAD})
    this.server.on('connection', this.onConnection.bind(this))
  }

  onConnection (socket) {
    log.debug('Connection received')
    socket.on('error', (err) => { log.debug('Error occurred:', err) })
    const fn = compose(this.middleware)

    const context = this.app.createContext(socket.upgradeReq)
    context.websocket = socket
    context.path = url.parse(socket.upgradeReq.url).pathname

    fn(context).catch((err) => { log.debug(err) })
  }

  use (fn) {
    this.middleware.push(fn)
    return this
  }
}

module.exports = function (app) {
  const oldListen = app.listen
  app.listen = function () {
    app.server = oldListen.apply(app, arguments)
    app.ws.listen(app.server)
    return app.server
  }
  app.ws = new KoaWebSocketServer(app)
  return app
}
