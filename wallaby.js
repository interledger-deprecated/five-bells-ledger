module.exports = function (wallaby) {
  return {
    files: [
      'src/**/*.js',
      'app.js',
      'test/helpers/*.js',
      'test/data/*'
    ],

    tests: [
      'test/*Spec.js'
    ],

    testFramework: 'mocha',

    env: {
      type: 'node',
      runner: 'node',
      params: {
        env: 'NODE_ENV=unit'
      }
    },

    bootstrap: function () {
      var path = require('path')
      require('co-mocha')(require(path.join(path.dirname(process.argv[1]), 'runners/node/mocha@2.1.0/framework/')))
    }
  }
}
