'use strict'

const bunyan = require('bunyan')
const config = require('./config')

function createLogger (name) {
  const logger = bunyan.createLogger({
    name: name,
    level: config.logLevel,
    stream: process.stdout
  })
  return logger
}

const defaultLogger = createLogger('ledger')
const loggers = [defaultLogger]

function createChildLogger (module) {
  const logger = defaultLogger.child({
    module: module
  })
  loggers.push(logger)
  return logger
}

// For unit testing
function setOutputStream (outputStream) {
  loggers.forEach((logger) => {
    logger.streams = []
    logger.addStream({
      type: 'stream',
      stream: outputStream,
      level: config.logLevel
    })
  })
}

defaultLogger.create = createChildLogger
defaultLogger.setOutputStream = setOutputStream
module.exports = defaultLogger

