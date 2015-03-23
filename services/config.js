'use strict';

const path = require('path');
const url = require('url');

const config = exports;

config.fdb = {};
config.fdb.cluster = process.env.FDB_CLUSTER;

config.server = {};
config.server.secure = false;
config.server.bind_ip = process.env.BIND_IP || '0.0.0.0';
config.server.port = process.env.PORT || 3000;
config.server.public_host = process.env.HOSTNAME || require('os').hostname();
config.server.public_port = process.env.PUBLIC_PORT || config.server.port;

if (process.env.NODE_ENV === 'test-sending') {
  config.fdb.cluster =
    path.resolve(__dirname, '../fdb-sending-ledger.cluster');
  config.server.public_host = 'localhost';
  config.server.public_port = config.server.port = 3001;
} else if (process.env.NODE_ENV === 'test-receiving') {
  config.fdb.cluster =
    path.resolve(__dirname, '../fdb-receiving-ledger.cluster');
  config.server.public_host = 'localhost';
  config.server.public_port = config.server.port = 3002;
} else if (process.env.NODE_ENV === 'unit') {
  config.server.public_host = 'localhost';
  config.server.port = 61337;
  config.server.public_port = 80;
}

// Calculate base_uri
const isCustomPort = config.server.secure ?
  +config.server.public_port !== 443 : +config.server.public_port !== 80;
config.server.base_host = config.server.public_host +
  (isCustomPort ? ':' + config.server.public_port : '');
config.server.base_uri = url.format({
  protocol: 'http' + (config.server.secure ? 's' : ''),
  host: config.server.base_host
});
