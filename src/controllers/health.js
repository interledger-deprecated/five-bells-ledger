'use strict'

const model = require('../models/health')
const cacheExpiry = 60000

let lastQueried
let cachedResult
/**
 * @api {get} /health Get server health status
 * @apiName GetHealth
 * @apiGroup Health
 * @apiVersion 1.0.0
 *
 * @apiDescription This endpoint will perform a quick self-check to ensure the
 *   server is still operating correctly.
 *
 * @apiIgnore For internal use.
 */
/**
 * @returns {void}
 */
exports.getResource = function * health () {
  const now = Date.now()
  // call model.getDbHealth(...) max. once per minute
  if (!lastQueried || lastQueried > (now - cacheExpiry)) {
    cachedResult = yield model.getDbHealth()
    lastQueried = now
  }
  this.body = cachedResult
}
