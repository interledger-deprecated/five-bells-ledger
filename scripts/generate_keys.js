'use strict'

const crypto = require('crypto')
const ed25519 = require('ed25519')

const secret = crypto.randomBytes(32)
const pubkey = ed25519.MakeKeypair(secret).publicKey

console.log('secret', secret.toString('base64'))
console.log('public', pubkey.toString('base64'))
