'use strict'

const riverpig = require('riverpig')

const defaultLogger = riverpig('ledger')

defaultLogger.create = riverpig

module.exports = defaultLogger

