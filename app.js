/* @flow */
'use strict';

// Node 0.10 Promise polyfill
if (!global.Promise) global.Promise = require('bluebird');

var messages = require('./controllers/messages');
var transfers = require('./controllers/transfers');
var holds = require('./controllers/holds');
var people = require('./controllers/people');
var compress = require('koa-compress');
var logger = require('koa-logger');
var serve = require('koa-static');
var route = require('koa-route');
var errorHandler = require('./middlewares/error-handler');
var koa = require('koa');
var path = require('path');
var log = require('./services/log');
var config = require('./services/config');
var app = module.exports = koa();

// Logger
app.use(logger({ reporter: log('koa') }));
// app.use(logger());
app.use(errorHandler);

app.use(route.get('/', messages.home));
app.use(route.get('/messages', messages.list));
app.use(route.get('/messages/:id', messages.fetch));
app.use(route.post('/messages', messages.create));
app.use(route.get('/async', messages.delay));

app.use(route.get('/v1/transfers/:id', transfers.fetch));
app.use(route.put('/v1/transfers/:uuid', transfers.create));

app.use(route.get('/v1/holds/:id', holds.fetch));
app.use(route.post('/v1/holds', holds.create));

app.use(route.get('/v1/people/:id', people.fetch));

// Serve static files
app.use(serve(path.join(__dirname, 'public')));

// Compress
app.use(compress());

if (!module.parent) {
  app.listen(config.server.port);
  log('app').info('listening on port '+config.server.port);
}
