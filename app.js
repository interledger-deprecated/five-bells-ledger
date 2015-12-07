/* @flow */
'use strict'
const co = require('co')
const health = require('./src/controllers/health')
const transfers = require('./src/controllers/transfers')
const accounts = require('./src/controllers/accounts')
const subscriptions = require('./src/controllers/subscriptions')
const timerWorker = require('./src/services/timerWorker')
const notificationWorker = require('./src/services/notificationWorker')
const compress = require('koa-compress')
const serve = require('koa-static')
const router = require('koa-router')()
const cors = require('koa-cors')
const passport = require('koa-passport')
const errorHandler = require('five-bells-shared/middlewares/error-handler')
const koa = require('koa')
const path = require('path')
const log = require('./src/services/log')
const logger = require('koa-mag')
const config = require('./src/services/config')
const db = require('./src/services/db')
const models = require('./src/models')
const app = module.exports = koa()
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')

// Configure passport
require('./src/services/auth')

// Logger
app.use(logger())

app.use(errorHandler({log: log('error-handler')}))
app.use(cors({expose: ['link']}))
app.use(passport.initialize())

router.get('/health', health.getResource)

router.put('/transfers/:id',
  passport.authenticate(['basic', 'http-signature', 'anonymous'], {
    session: false
  }),
  models.Transfer.createBodyParser(),
  transfers.putResource)

router.get('/transfers/:id', transfers.getResource)
router.get('/transfers/:id/state', transfers.getStateResource)

router.get('/accounts', accounts.getCollection)
router.get('/accounts/:id', accounts.getResource)
router.put('/accounts/:id',
  passport.authenticate(['basic', 'http-signature'], { session: false }),
  filterAdmin,
  models.Account.createBodyParser(),
  accounts.putResource)

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
    yield timerWorker.start()
    yield notificationWorker.start()

    if (config.db.sync) yield db.sync()
    if (db.options.dialect === 'sqlite') {
      // Sequelize does not properly handle SQLITE_BUSY errors, so it's better
      // to avoid them by waiting longer
      yield db.query('PRAGMA busy_timeout = 0;')
      // Write-ahead log is faster
      yield db.query('PRAGMA journal_mode = WAL;')
      // SQLite is only intended for testing, so we don't care about durability
      yield db.query('PRAGMA synchronous = off;')
      db.getQueryInterface().QueryGenerator.startTransactionQuery = function (transaction, options) {
        if (options.parent) {
          return 'SAVEPOINT ' + this.quoteIdentifier(transaction.name) + ';'
        }
        return 'BEGIN IMMEDIATE;'
      }
    }

    const holdAccount = yield models.Account.findByName('hold')
    if (!holdAccount) {
      yield models.Account.create({name: 'hold', balance: '0'})
    }

    if (config.default_admin) {
      let admin = config.default_admin
      let admin_account = yield models.Account.findByName(admin.user)
      // Update the password if the account already exists.
      if (admin_account) {
        admin_account.password = admin.pass
        yield admin_account.save()
      } else {
        yield models.Account.create({
          name: admin.user,
          balance: '0',
          password: admin.pass,
          is_admin: true
        })
      }
    }

    app.listen(config.server.port)
    log('app').info('ledger listening on ' + config.server.bind_ip + ':' +
      config.server.port)
    log('app').info('public at ' + config.server.base_uri)
  }).catch((err) => log('app').critical(err && err.stack ? err.stack : err))
}

function * filterAdmin (next) {
  if (this.req.user && this.req.user.is_admin) {
    yield next
  } else {
    throw new UnauthorizedError('You aren\'t an admin')
  }
}
