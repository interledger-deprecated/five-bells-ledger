/* @flow */
'use strict'

// SIGINT does not cleanup the DB connection pool
// so we have an exitHandler to clean up the database connection
// See: https://github.com/tgriesser/bookshelf/issues/405
function exitHandler (error) {
  if (error) {
    console.error(error.stack)
    process.exit(1)
  }
  process.exit(0)
}

module.exports = require('./lib/app')

if (!module.parent) {
  process.on('SIGINT', exitHandler)
  require('./services/app').start()
}
