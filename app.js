/* @flow */
'use strict';

const health = require('./controllers/health');
const transfers = require('./controllers/transfers');
const accounts = require('./controllers/accounts');
const subscriptions = require('./controllers/subscriptions');
const timerWorker = require('./services/timerWorker');
const compress = require('koa-compress');
const serve = require('koa-static');
const route = require('koa-route');
const cors = require('koa-cors');
const errorHandler = require('@ripple/five-bells-shared/middlewares/error-handler');
const koa = require('koa');
const path = require('path');
const log = require('@ripple/five-bells-shared/services/log');
const logger = require('koa-mag');
const config = require('./services/config');
const app = module.exports = koa();

// Logger
app.use(logger());
app.use(errorHandler);
app.use(cors({expose: ['link']}));

app.use(route.get('/health', health.get));

app.use(route.get('/transfers/:id', transfers.fetch));
app.use(route.put('/transfers/:uuid', transfers.create));
app.use(route.get('/transfers/:id/state', transfers.getState));

app.use(route.get('/accounts', accounts.find));
app.use(route.get('/accounts/:id', accounts.fetch));
app.use(route.put('/accounts/:id', accounts.putResource));

app.use(route.post('/subscriptions', subscriptions.create));
app.use(route.get('/subscriptions/:id', subscriptions.fetch));
app.use(route.put('/subscriptions/:id', subscriptions.update));
app.use(route.delete('/subscriptions/:id', subscriptions.remove));

// Serve static files
app.use(serve(path.join(__dirname, 'public')));
app.use(serve(path.join(__dirname, 'public')));

// Compress
app.use(compress());

if (!module.parent) {
  // Start timerWorker to trigger the transferExpiryMonitor
  // when transfers are going to expire
  timerWorker.start();

  app.listen(config.server.port);
  log('app').info('ledger listening on ' + config.server.bind_ip + ':' +
    config.server.port);
  log('app').info('public at ' + config.server.base_uri);
}
