/* @flow */
'use strict'

module.exports = require('./src/lib/app')
if (!module.parent) {
  require('./src/services/app').start()
}
