'use strict';

// This helper captures log output for each test and prints it in case of
// failure. This means that a successful test run will only print mocha's output
// whereas a failed run will include more information.

const logger = require('../../services/log');
const through = require('through2');

module.exports = function () {
  beforeEach(function() {
    const buffer = through();
    logger.setOutputStream(buffer);
  });

  afterEach(function() {
    const buffer = logger.currentOutput;
    if (this.currentTest.state !== 'passed') {
      buffer.pipe(process.stdout);
    }
    logger.setOutputStream(process.stdout);
  });
};
