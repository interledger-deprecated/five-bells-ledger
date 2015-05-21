'use strict';

const db = require('../services/db');
const log = require('@ripple/five-bells-shared/services/log')('create_user');

const argv = process.argv.slice(2);

if (argv.length < 1) {
  console.log('Syntax: create_user <username> [ <balance> ] [ <identity> ]');
  process.exit(1);
}

const balance = isNaN(+argv[1]) ? 0 : +argv[1];
const identity = argv[2];

// Create or update a user's balance
db.create('accounts', {
  id: argv[0].toLowerCase(),
  balance: balance,
  identity: identity
}).then(function () {
  log.info('Success, user ' + argv[0].toLowerCase() + ' has balance ' +
           balance);
});
