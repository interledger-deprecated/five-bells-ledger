'use strict';

const db = require('../services/db');
const log = require('../services/log')('create_user');

const argv = process.argv.slice(2);

if (argv.length < 1) {
  console.log('Syntax: create_user <username> [ <balance> ]');
  process.exit(1);
}

const balance = isNaN(+argv[1]) ? 0 : +argv[1];

// Create or update a user's balance
db.create('people', {
  id: argv[0].toLowerCase(),
  balance: balance
}).then(function () {
  log.info('Success, user ' + argv[0].toLowerCase() + ' has balance ' +
           balance);
});
