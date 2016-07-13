'use strict'

const bunyan = require('bunyan')
const _ = require('lodash')
const config = require('./config')

function createLogger (name) {
  return bunyan.createLogger(_.omit({
    name: name,
    level: config.logLevel
  }, _.isUndefined))
}

module.exports = createLogger
