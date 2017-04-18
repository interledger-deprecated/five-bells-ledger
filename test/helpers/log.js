'use strict'

// This helper captures log output for each test and prints it in case of
// failure. This means that a successful test run will only print mocha's output
// whereas a failed run will include more information.

const through = require('through2')
const chalk = require('chalk')

module.exports = function (logger) {
  let buffer
  if (process.env['SHOW_STDOUT']) {
    return
  }
  beforeEach(function () {
    buffer = through()
    buffer.pause()
    logger.setOutputStream(buffer)
  })

  afterEach(function (done) {
    const ARROW_UP = '\u2191'
    const ARROW_DOWN = '\u2193'
    function format (str, arrow) {
      return '\n' + chalk.red(arrow + ' ' + str + ' ' + arrow) + '\n\n'
    }
    if (this.currentTest.state !== 'passed') {
      process.stdout.write(format('stdout for failing test', ARROW_DOWN))
      buffer.pipe(process.stdout, { end: false })
      buffer.end()
      logger.setOutputStream(process.stdout)
      buffer.on('end', () => {
        process.stdout.write(format('stdout for failing test', ARROW_UP))
        done()
      })
    } else {
      done()
    }
  })
}
