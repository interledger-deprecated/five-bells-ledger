/* @flow */
'use strict'
const co = require('co')
const health = require('./src/controllers/health')
const transfers = require('./src/controllers/transfers')
const accounts = require('./src/controllers/accounts')
const subscriptions = require('./src/controllers/subscriptions')
const timerWorker = require('./src/services/timerWorker')
const compress = require('koa-compress')
const serve = require('koa-static')
const router = require('koa-router')()
const cors = require('koa-cors')
const passport = require('koa-passport')
const errorHandler = require('@ripple/five-bells-shared/middlewares/error-handler')
const koa = require('koa')
const path = require('path')
const log = require('./src/services/log')
const logger = require('koa-mag')
const config = require('./src/services/config')
const db = require('./src/services/db')
const models = require('./src/models')
const app = module.exports = koa()

// Configure passport
require('./src/services/auth')

// Logger
app.use(logger())

app.use(errorHandler({log: log('error-handler')}))
app.use(cors({expose: ['link']}))
app.use(passport.initialize())

router.get('/health', health.getResource)

router.put('/transfers/:id',
  passport.authenticate(['basic', 'anonymous'], {
    session: false
  }),
  models.Transfer.createBodyParser(),
  transfers.putResource)

router.get('/transfers/:id', transfers.getResource)
router.get('/transfers/:id/state', transfers.getStateResource)

router.get('/accounts', accounts.getCollection)
router.get('/accounts/:id', accounts.getResource)
router.put('/accounts/:id', models.Account.createBodyParser(), accounts.putResource)

router.post('/subscriptions', models.Subscription.createBodyParser(), subscriptions.postResource)
router.get('/subscriptions/:id', subscriptions.getResource)
router.put('/subscriptions/:id', models.Subscription.createBodyParser(), subscriptions.putResource)
router.delete('/subscriptions/:id', subscriptions.deleteResource)

app.use(router.middleware())
app.use(router.routes())

// Serve static files
app.use(serve(path.join(__dirname, 'public')))

// Compress
app.use(compress())

if (!module.parent) {
  co(function * () {
    // Start timerWorker to trigger the transferExpiryMonitor
    // when transfers are going to expire
    timerWorker.start()

    if (config.db.sync) yield db.sync()
    if (db.options.dialect === 'sqlite') {
      yield db.query('PRAGMA busy_timeout = 10000;')
      db.getQueryInterface().QueryGenerator.startTransactionQuery = function (transaction, options) {
        if (options.parent) {
          return 'SAVEPOINT ' + this.quoteIdentifier(transaction.name) + ';'
        }
        return 'BEGIN IMMEDIATE;'
      }
    }

    app.listen(config.server.port)
    log('app').info('ledger listening on ' + config.server.bind_ip + ':' +
      config.server.port)
    log('app').info('public at ' + config.server.base_uri)
  }).catch((err) => log('app').critical(err && err.stack ? err.stack : err))
}
