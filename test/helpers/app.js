'use strict'

const superagent = require('supertest')
const WebSocket = require('ws')
const methods = require('methods')
const url = require('url')

const TEST_HOSTNAME = 'localhost'
const TEST_PORT = null

/**
 * Rewrite a test URL to point to the temporary test app port.
 *
 * This method will take a URL like 'http://localhost/foo' and make it point to
 * the test endpoint, e.g. 'http://localhost:42810/foo'.
 *
 * @private
 */
function processUrl (inputUrl, port) {
  const parsedUrl = url.parse(inputUrl)

  if (parsedUrl.host === TEST_HOSTNAME &&
      parsedUrl.port === TEST_PORT) {
    const path = url.format({
      protocol: 'http',
      hostname: 'localhost',
      port,
      pathname: parsedUrl.pathname,
      search: parsedUrl.search
    })
    return path
  }

  return inputUrl
}

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
  context.server = app.koa.listen()
  const port = context.port = context.server.address().port

  context.request = function () {
    const request = superagent(context.server)

    methods.forEach(function (method) {
      const _previous = request[method]
      request[method] = wrapMethodUrlPreprocess(_previous)
    })

    return request
  }

  context.ws = function (uri, protocols, options) {
    const processedUri = processUrl(uri, port)
    return new WebSocket(processedUri, protocols, options)
  }
}
