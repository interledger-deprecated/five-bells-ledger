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
  return useTLS ? _.omit(_.pick(tls, ['cert', 'key', 'ca', 'crl']), _.isUndefined)
                : {}
}

function sendNotification (target, notificationBody, config) {
  return request(target, _.assign({
    method: 'post',
    json: true,
    body: notificationBody
  }, tlsOptions(target, config)))
}

module.exports = {
  sendNotification: sendNotification
}
