/* @flow */
'use strict'

const app = require('./src/services/app')
if (!module.parent) app.start()
module.exports = app.app
