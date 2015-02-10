var db = require('../../services/db');

exports.reset = function () {
  return db.transaction(function *(tr) {
    yield tr.remove(['holds']);
    yield tr.remove(['transfers']);
    yield tr.remove(['people']);
  });
};
