'use strict';

var co = require('co');
var Database = require('fowl').Database;

var db = new Database({
  idProp: 'id'
});

db.open();

// Add co support for transactions
db._transaction = db.transaction;
db.transaction = function (generatorFunction) {
  // Turn the generator into a promise, then call upstream transaction().
  return db._transaction(function (tr) {
    var generator = generatorFunction.call(this, tr);
    if ('function' === typeof generator.next) {
      return co(generator);
    } else {
      return generator;
    }
  });
};

module.exports = db;
