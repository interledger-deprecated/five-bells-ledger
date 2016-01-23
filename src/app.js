/* @flow */
'use strict'

module.exports = require('./lib/app')
if (!module.parent) {
  require('./services/app').start()
}
