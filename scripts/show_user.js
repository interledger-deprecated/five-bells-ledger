'use strict';

const db = require('../services/db');
const log = require('../services/log')('show_user');

const argv = process.argv.slice(2);

if (argv.length < 1) {
  console.log('Syntax: show_user <username>');
  process.exit(1);
}

// Get user's balance
db.get(['people', argv[0].toLowerCase()]).then(function (user) {
  if (user) {
    log.info('User ' + user.id + ' has balance ' + user.balance);
  } else {
    log.error('User ' + argv[0].toLowerCase() + ' not found');
  }
});
