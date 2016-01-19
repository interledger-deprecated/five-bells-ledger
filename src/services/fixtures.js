'use strict'

const Fixtures = require('../lib/fixtures')
module.exports = new Fixtures(
  require('./db'),
  require('./config'))
