var db = require('../../services/db');

exports.reset = function () {
  return db.transaction(function *(tr) {
    tr.remove(['holds']);
    tr.remove(['transfers']);
    tr.remove(['people']);
    tr.remove(['subscriptions']);
  });
};
