'use strict'

const http = require('http')
const superagent = require('co-supertest')
const methods = require('methods')
const url = require('url')

const TEST_HOSTNAME = 'localhost'
const TEST_PORT = null

/**
 * Wraps a method to preprocess url parameter.
 *
 * Modifies a method such that the first parameter is preprocessed into a local
 * URL if it matches the TEST_HOSTNAME and TEST_PORT set in this file.
 *
 * Used internally.
 *
 * @private
 */
function wrapMethodUrlPreprocess (method) {
  return function (inputUrl, fn) {
    const parsedUrl = url.parse(inputUrl)

    // Replace local
    if (parsedUrl.host === TEST_HOSTNAME &&
        parsedUrl.port === TEST_PORT) {
      const path = url.format({
        pathname: parsedUrl.pathname,
        search: parsedUrl.search
      })
      return method.call(this, path, fn)
    }

    return method.call(this, inputUrl, fn)
  }
}

methods.forEach(function (method) {
  const _previous = superagent.agent.prototype[method]
  superagent.agent.prototype[method] = wrapMethodUrlPreprocess(_previous)
})

exports.create = function (context, app) {
  context.server = http.createServer(app.app.callback()).listen()
  context.port = context.server.address().port

  context.request = function () {
    const request = superagent(context.server)

    methods.forEach(function (method) {
      const _previous = request[method]
      request[method] = wrapMethodUrlPreprocess(_previous)
    })

    return request
  }
}
