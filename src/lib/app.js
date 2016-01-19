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
const models = require('../models')

// Configure passport
require('../services/auth')

function App (modules) {
  this.log = modules.log('app')
  this.config = modules.config
  this.db = modules.db
  this.timerWorker = modules.timerWorker
  this.notificationWorker = modules.notificationWorker
  this.fixtures = modules.fixtures

  const app = this.app = koa()
  const router = this.makeRouter()
  app.use(logger())
  app.use(errorHandler({log: modules.log('error-handler')}))
  app.use(cors({expose: ['link']}))
  app.use(passport.initialize())
  app.use(router.middleware())
  app.use(router.routes())
  // Serve static files
  app.use(serve(path.join(__dirname, 'public')))
  app.use(compress())
}

App.prototype.start = function () {
  const log = this.log
  co(this._start.bind(this)).catch(function (err) {
    log.critical((err && err.stack) ? err.stack : err)
  })
}

App.prototype._start = function * () {
  // Start timerWorker to trigger the transferExpiryMonitor
  // when transfers are going to expire
  yield this.timerWorker.start()
  yield this.notificationWorker.start()

  if (this.config.db.sync) yield this.db.sync()
  yield this.db.init()
  yield this.fixtures.setup()

  this.app.listen(this.config.server.port)
  this.log.info('ledger listening on ' +
    this.config.server.bind_ip + ':' +
    this.config.server.port)
  this.log.info('public at ' + this.config.server.base_uri)
}

App.prototype.makeRouter = function () {
  const router = new Router()
  router.get('/health', health.getResource)

  router.put('/transfers/:id',
    passport.authenticate(['basic', 'http-signature', 'anonymous'], {
      session: false
    }),
    models.Transfer.createBodyParser(),
    transfers.putResource)

  router.get('/transfers/:id', transfers.getResource)
  router.get('/transfers/:id/state', transfers.getStateResource)

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

  router.post('/subscriptions', models.Subscription.createBodyParser(), subscriptions.postResource)
  router.get('/subscriptions/:id', subscriptions.getResource)
  router.put('/subscriptions/:id', models.Subscription.createBodyParser(), subscriptions.putResource)
  router.delete('/subscriptions/:id', subscriptions.deleteResource)
  return router
}

function * filterAdmin (next) {
  if (this.req.user && this.req.user.is_admin) {
    yield next
  } else {
    throw new UnauthorizedError('You aren\'t an admin')
  }
}

module.exports = App
