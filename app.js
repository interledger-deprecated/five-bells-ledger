/* @flow */
'use strict'

const health = require('./controllers/health')
const transfers = require('./controllers/transfers')
const accounts = require('./controllers/accounts')
const subscriptions = require('./controllers/subscriptions')
const timerWorker = require('./services/timerWorker')
const compress = require('koa-compress')
const serve = require('koa-static')
const router = require('koa-router')()
const cors = require('koa-cors')
const passport = require('koa-passport')
const errorHandler = require('@ripple/five-bells-shared/middlewares/error-handler')
const koa = require('koa')
const path = require('path')
const log = require('./services/log')
const logger = require('koa-mag')
const config = require('./services/config')
const models = require('./models')
const app = module.exports = koa()

// Configure passport
require('./services/auth')

// Logger
app.use(logger())

app.use(errorHandler)
app.use(cors({expose: ['link']}))
app.use(passport.initialize())

router.get('/health', health.get)

router.put('/transfers/:id',
  passport.authenticate(['basic', 'anonymous'], {
    session: false
  }),
  models.Transfer.bodyParser(),
  transfers.create)

router.get('/transfers/:id', transfers.fetch)
router.get('/transfers/:id/state', transfers.getState)

router.get('/accounts', accounts.find)
router.get('/accounts/:id', accounts.fetch)
router.put('/accounts/:id', accounts.putResource)

router.post('/subscriptions', subscriptions.create)
router.get('/subscriptions/:id', subscriptions.fetch)
router.put('/subscriptions/:id', subscriptions.update)
router.delete('/subscriptions/:id', subscriptions.remove)

app.use(router.middleware())
app.use(router.routes())

// Serve static files
app.use(serve(path.join(__dirname, 'public')))
app.use(serve(path.join(__dirname, 'public')))

// Compress
app.use(compress())

if (!module.parent) {
  // Start timerWorker to trigger the transferExpiryMonitor
  // when transfers are going to expire
  timerWorker.start()

  app.listen(config.server.port)
  log('app').info('ledger listening on ' + config.server.bind_ip + ':' +
    config.server.port)
  log('app').info('public at ' + config.server.base_uri)
}
