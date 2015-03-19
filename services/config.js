'use strict';

const path = require('path');

exports.fdb = {};
exports.fdb.cluster = process.env.FDB_CLUSTER;

exports.server = {};
exports.server.port = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'test-sending') {
  exports.fdb.cluster =
    path.resolve(__dirname, '../fdb-sending-ledger.cluster');
  exports.server.port = 3001;
} else if (process.env.NODE_ENV === 'test-receiving') {
  exports.fdb.cluster =
    path.resolve(__dirname, '../fdb-receiving-ledger.cluster');
  exports.server.port = 3002;
}
