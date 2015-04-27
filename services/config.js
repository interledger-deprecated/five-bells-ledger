'use strict';

const url = require('url');
const tweetnacl = require('tweetnacl');
const log = require('five-bells-shared/services/log')('config');

const config = exports;

config.db = {};
config.db.uri = process.env.ROACH_URI;
config.db.subspace = 'five-bells-ledger';

config.server = {};
config.server.secure = false;
config.server.bind_ip = process.env.BIND_IP || '0.0.0.0';
config.server.port = process.env.PORT || 3000;
config.server.public_host = process.env.HOSTNAME || require('os').hostname();
config.server.public_port = process.env.PUBLIC_PORT || config.server.port;

if (process.env.NODE_ENV === 'test') {
  config.server.public_host = 'localhost';
  config.db.subspace = 'five-bells-ledger-' + config.server.port;
} else if (process.env.NODE_ENV === 'unit') {
  config.server.public_host = 'localhost';
  config.server.port = 61337;
  config.server.public_port = 80;
  config.db.subspace = 'five-bells-ledger-unit-test-' + process.pid;
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

config.keys = {};
config.keys.ed25519 = {
  secret: process.env.ED25519_SECRET_KEY,
  public: process.env.ED25519_PUBLIC_KEY
};

let keyPair;
if (!config.keys.ed25519.secret) {
  log.warn('No ED25519_SECRET_KEY provided. Generating a random one. ' +
    'DO NOT DO THIS IN PRODUCTION');
  keyPair = tweetnacl.sign.keyPair();
  config.keys.ed25519.secret = tweetnacl.util.encodeBase64(keyPair.secretKey);
  config.keys.ed25519.public = tweetnacl.util.encodeBase64(keyPair.publicKey);
}

if (!config.keys.ed25519.public) {
  if (!keyPair) {
    keyPair = tweetnacl.sign.keyPair.fromSecretKey(
        tweetnacl.util.decodeBase64(config.keys.ed25519.secret));
  }
  config.keys.ed25519.public =
    tweetnacl.util.encodeBase64(keyPair.publicKey);
}
