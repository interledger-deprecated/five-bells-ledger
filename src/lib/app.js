'use strict'
const co = require('co')
const compress = require('koa-compress')
const serve = require('koa-static')
const Router = require('koa-router')
const cors = require('koa-cors')
const passport = require('koa-passport')
const koa = require('koa')
const path = require('path')
const logger = require('koa-mag')
const errorHandler = require('five-bells-shared/middlewares/error-handler')
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const health = require('../controllers/health')
const transfers = require('../controllers/transfers')
const accounts = require('../controllers/accounts')
const subscriptions = require('../controllers/subscriptions')
const notifications = require('../controllers/notifications')
const models = require('../models/db')
const seedDB = require('./seed-db')
const fs = require('fs')

// Configure passport
require('../services/auth')

class App {
  constructor (modules) {
    this.log = modules.log('app')
    this.config = modules.config
    this.db = modules.db
    this.timerWorker = modules.timerWorker
    this.notificationWorker = modules.notificationWorker

    const koaApp = this.koa = koa()
    const router = this._makeRouter()
    koaApp.use(logger())
    koaApp.use(errorHandler({log: modules.log('error-handler')}))
    koaApp.use(cors({expose: ['link']}))
    koaApp.use(passport.initialize())
    koaApp.use(router.middleware())
    koaApp.use(router.routes())
    // Serve static files
    koaApp.use(serve(path.join(__dirname, 'public')))
    koaApp.use(compress())
  }

  start () {
    const log = this.log
    co(this._start.bind(this)).catch(function (err) {
      log.critical((err && err.stack) ? err.stack : err)
    })
  }

  * _start () {
    // Start timerWorker to trigger the transferExpiryMonitor
    // when transfers are going to expire
    yield this.timerWorker.start()
    yield this.notificationWorker.start()

    if (this.config.getIn(['db', 'sync'])) yield this.db.sync()
    yield this.db.init()
    yield seedDB(this.config)

    if (this.config.getIn(['server', 'secure'])) {
      const https = require('https')
      const tls = this.config.get('tls').toJS()

      const options = {
        port: this.config.getIn(['server', 'port']),
        host: this.config.getIn(['server', 'bind_ip']),
        key: fs.readFileSync(tls.key),
        cert: fs.readFileSync(tls.cert),
        ca: tls.ca && fs.readFileSync(tls.ca),
        crl: tls.crl && fs.readFileSync(tls.crl),
        requestCert: this.config.getIn(['auth', 'client_certificates_enabled']),

        // Certificates are checked in the passport-client-cert middleware
        // Authorization check is disabled here to allow clients to connect
        // to some endpoints without presenting client certificates, or using a
        // different authentication method (e.g., Basic Auth)
        rejectUnauthorized: false
      }

      https.createServer(
        options, this.koa.callback()).listen(this.config.getIn(['server', 'port']))
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
    router.get('/health', health.getResource)

    router.put('/transfers/:id',
      passport.authenticate(['basic', 'http-signature', 'anonymous'], {
        session: false
      }),
      models.Transfer.createBodyParser(),
      transfers.putResource)

    router.put('/transfers/:id/fulfillment',
      passport.authenticate(['basic', 'http-signature', 'anonymous'], {
        session: false
      }), models.ConditionFulfillment.createBodyParser(),
      transfers.putFulfillment)
    router.get('/transfers/:id/fulfillment',
      passport.authenticate(['basic', 'http-signature', 'anonymous'], {
        session: false
      }),
      transfers.getFulfillment)

    router.get('/transfers/:id', transfers.getResource)
    router.get('/transfers/:id/state', transfers.getStateResource)
    router.get('/transfers/:id/hash_preimage', transfers.getPreimage)
    router.get('/transfers/public_key', transfers.getPublicKey)

    router.get('/connectors',
      accounts.getConnectors)
    router.get('/accounts',
      passport.authenticate(['basic', 'http-signature'], { session: false }),
      filterAdmin,
      accounts.getCollection)
    router.get('/accounts/:name',
      passport.authenticate(['basic', 'http-signature', 'anonymous'], { session: false }),
      accounts.getResource)
    router.put('/accounts/:name',
      passport.authenticate(['basic', 'http-signature'], { session: false }),
      filterAdmin,
      models.Account.createBodyParser(),
      accounts.putResource)

    router.get('/subscriptions/:id',
      passport.authenticate(['basic', 'http-signature'], { session: false }),
      subscriptions.getResource)
    router.put('/subscriptions/:id',
      passport.authenticate(['basic', 'http-signature'], { session: false }),
      models.Subscription.createBodyParser(),
      subscriptions.putResource)
    router.delete('/subscriptions/:id',
      passport.authenticate(['basic', 'http-signature'], { session: false }),
      subscriptions.deleteResource)

    router.get('/subscriptions/:subscription_id/notifications/:notification_id',
      passport.authenticate(['basic', 'http-signature'], { session: false }),
      notifications.getResource)
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

module.exports = App
