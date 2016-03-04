'use strict'

const request = require('co-request')
const _ = require('lodash')
const url = require('url')

function isHTTPS (uri) {
  return url.parse(uri).protocol.match(/https/) !== null
}

function tlsOptions (target, config) {
  const tls = config.get('tls')
  const useTLS = isHTTPS(target) && tls
  return useTLS ? _.omit({
    cert: tls.get('cert'),
    key: tls.get('key'),
    ca: tls.get('ca'),
    crl: tls.get('crl')
  }, _.isUndefined) : {}
}

function * sendNotification (target, notificationBody, config) {
  yield * request(target, _.assign({
    method: 'post',
    json: true,
    body: notificationBody
  }, tlsOptions(target, config)))
}

module.exports = {
  sendNotification: sendNotification
}
