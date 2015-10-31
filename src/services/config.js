'use strict'

const tweetnacl = require('tweetnacl')
const log = require('./log')('config')
const Config = require('five-bells-shared').Config

const config = module.exports = new Config('ledger')

config.parseServerConfig()
config.parseDatabaseConfig()

if (process.env.NODE_ENV === 'unit') {
  config.server.public_host = 'localhost'
  config.server.port = 61337
  config.server.public_port = 80
  config.db.uri = 'sqlite://:memory:'
  config.updateDerivativeServerConfig()
}

config.keys = {}
config.keys.ed25519 = {
  secret: process.env.ED25519_SECRET_KEY,
  public: process.env.ED25519_PUBLIC_KEY
}

let keyPair
if (!config.keys.ed25519.secret) {
  log.warn('No ED25519_SECRET_KEY provided. Generating a random one. ' +
    'DO NOT DO THIS IN PRODUCTION')
  keyPair = tweetnacl.sign.keyPair()
  config.keys.ed25519.secret = tweetnacl.util.encodeBase64(keyPair.secretKey)
  config.keys.ed25519.public = tweetnacl.util.encodeBase64(keyPair.publicKey)
}

if (!config.keys.ed25519.public) {
  if (!keyPair) {
    keyPair = tweetnacl.sign.keyPair.fromSecretKey(
      tweetnacl.util.decodeBase64(config.keys.ed25519.secret))
  }
  config.keys.ed25519.public =
    tweetnacl.util.encodeBase64(keyPair.publicKey)
}
