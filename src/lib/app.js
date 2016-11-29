'use strict'
const co = require('co')
const parseBody = require('co-body')
const compress = require('koa-compress')
const serve = require('koa-static')
const Router = require('koa-router')
const cors = require('koa-cors')
const passport = require('koa-passport')
const websockify = require('koa-websocket')
const koa = require('koa')
const path = require('path')
const makeLogger = require('koa-riverpig')
const errorHandler = require('five-bells-shared/middlewares/error-handler')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const getMetadataRoute = require('../controllers/metadata')
const health = require('../controllers/health')
const transfers = require('../controllers/transfers')
const messages = require('../controllers/messages')
const accounts = require('../controllers/accounts')
const authTokens = require('../controllers/authTokens')
const seedDB = require('./seed-db')
const createTables = require('./db').createTables
const readLookupTables = require('./db').readLookupTables
const accountsModel = require('../models/accounts')

// Configure passport
require('../services/auth')

class App {
  constructor (modules) {
    this.log = modules.log.create('app')
    this.config = modules.config
    this.metadata = getMetadataRoute(this.config)
    this.db = modules.db
    this.timerWorker = modules.timerWorker
    this.notificationBroadcaster = modules.notificationBroadcaster

    const koaApp = this.koa = websockify(koa())
    const router = this._makeRouter()
    const logger = makeLogger({logger: modules.log.create('koa')})
    koaApp.use(logger)
    koaApp.use(errorHandler({log: modules.log.create('error-handler')}))
    koaApp.on('error', function () {})
    koaApp.use(cors({expose: ['link']}))
    koaApp.use(passport.initialize())
    koaApp.use(router.middleware())
    koaApp.use(router.routes())
    // Serve static files
    koaApp.use(serve(path.join(__dirname, 'public')))
    koaApp.use(compress())

    const websocketRouter = this._makeWebsocketRouter()
    koaApp.ws.use(logger)
    koaApp.ws.use(errorHandler({log: modules.log.create('ws-error-handler')}))
    koaApp.ws.use(passport.initialize())
    koaApp.ws.use(websocketRouter.routes())
    koaApp.ws.use(websocketRouter.allowedMethods())
  }

  start () {
    const log = this.log
    co(this._start.bind(this)).catch(function (err) {
      log.error((err && err.stack) ? err.stack : err)
    })
  }

  * _start () {
    // Start timerWorker to trigger the transferExpiryMonitor
    // when transfers are going to expire
    yield this.timerWorker.start()

    try {
      this.log.info('syncing database')
      yield createTables()
    } catch (e) {
      this.log.info('database sync aborted')
    }

    yield readLookupTables()
    yield seedDB(this.config)
    yield accountsModel.verifyConnectors(this.config)

    if (this.config.getIn(['server', 'secure'])) {
      const spdy = require('spdy')
      const tls = this.config.get('tls')

      const options = {
        port: this.config.getIn(['server', 'port']),
        host: this.config.getIn(['server', 'bind_ip']),
        key: tls.key,
        cert: tls.cert,
        ca: tls.ca,
        crl: tls.crl,
        requestCert: this.config.getIn(['auth', 'client_certificates_enabled']),

        // Certificates are checked in the passport-client-cert middleware
        // Authorization check is disabled here to allow clients to connect
        // to some endpoints without presenting client certificates, or using a
        // different authentication method (e.g., Basic Auth)
        rejectUnauthorized: false
      }

      const server = spdy.createServer(
        options, this.koa.callback()).listen(this.config.getIn(['server', 'port']))
      this.koa.ws.listen(server)
    } else {
      this.koa.listen(this.config.getIn(['server', 'port']))
    }

    this.log.info('ledger listening on ' +
      this.config.getIn(['server', 'bind_ip']) + ':' +
      this.config.getIn(['server', 'port']))
    this.log.info('public at ' + this.config.getIn(['server', 'base_uri']))
  }

  _makeRouter () {
    const router = new Router()
    router.get('/', this.metadata.getResource)
    router.get('/health', health.getResource)

    router.post('/messages',
      passport.authenticate(['basic', 'http-signature', 'client-cert'], { session: false }),
      setupBody,
      messages.postMessage)
    router.get('/auth_token',
      passport.authenticate(['basic', 'http-signature', 'client-cert'], { session: false }),
      authTokens.getAuthToken)

    router.put('/transfers/:id',
      passport.authenticate(['basic', 'http-signature', 'client-cert'], { session: false }),
      setupBody,
      transfers.putResource)

    router.put('/transfers/:id/fulfillment', transfers.putFulfillment)
    router.get('/transfers/:id/fulfillment', transfers.getFulfillment)
    router.put('/transfers/:id/rejection',
      passport.authenticate(['basic', 'http-signature', 'client-cert'], { session: false }),
      transfers.putRejection)

    router.get('/transfers/:id', transfers.getResource)
    router.get('/transfers/byExecutionCondition/:execution_condition', transfers.getResourcesByExecutionCondition)
    router.get('/transfers/:id/state', transfers.getStateResource)

    router.get('/accounts',
      passport.authenticate(['basic', 'http-signature', 'client-cert'], { session: false }),
      filterAdmin,
      accounts.getCollection)
    router.get('/accounts/:name',
      passport.authenticate(['basic', 'http-signature', 'client-cert', 'anonymous'], { session: false }),
      accounts.getResource)
    router.put('/accounts/:name',
      passport.authenticate(['basic', 'http-signature', 'client-cert'], { session: false }),
      setupBody,
      accounts.putResource)

    return router
  }

  _makeWebsocketRouter () {
    const log = this.log
    const router = new Router()

    // Passport errors don't play nice with the koa-websocket context, so use a custom handler.
    router.get('/websocket', function * () {
      yield passport.authenticate(['basic', 'http-signature', 'client-cert', 'token'], {
        session: false
      }, function * (err, user, info) {
        if (user) {
          this.req.user = user
          yield accounts.subscribeTransfers.call(this)
        } else {
          log.warn('websocket authentication error: ' + (err && err.message) + ' info: ' + JSON.stringify(info))
          this.websocket.close()
        }
      }.bind(this))
    })

    return router
  }
}

function * filterAdmin (next) {
  if (this.req.user && this.req.user.is_admin) {
    yield next
  } else {
    throw new UnauthorizedError('You aren\'t an admin')
  }
}

function * setupBody (next) {
  this.body = yield parseBody(this)
  yield next
}

module.exports = App
