'use strict'

const bunyan = require('bunyan')
const config = require('./config')

function createLogger (name) {
  return bunyan.createLogger({
    name: name,
    level: config.logLevel,
    stream: process.stdout
  })
}

const defaultLogger = createLogger('ledger')
const loggers = [defaultLogger]

function createChildLogger (module) {
  const logger = defaultLogger.child({module: module})
  loggers.push(logger)
  return logger
}

function setOutputStream (buffer) {
  loggers.forEach((logger) => {
    logger.streams = []
    logger.addStream({
      type: 'stream',
      stream: buffer,
      closeOnExit: false,
      level: config.logLevel
    })
  })
}

defaultLogger.create = createChildLogger
defaultLogger.setOutputStream = setOutputStream
module.exports = defaultLogger

