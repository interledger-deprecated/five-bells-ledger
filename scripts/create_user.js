'use strict'

const db = require('../services/db')
const log = require('../services/log')('create_user')

const argv = process.argv.slice(2)

if (argv.length < 1) {
  console.log('Syntax: create_user <username> [ <balance> ] [ <connector> ]')
  process.exit(1)
}

const balance = isNaN(+argv[1]) ? 0 : +argv[1]
const connector = argv[2]

// Create or update a user's balance
db.create('accounts', {
  id: argv[0].toLowerCase(),
  balance: balance,
  connector: connector
}).then(function () {
  log.info('Success, user ' + argv[0].toLowerCase() + ' has balance ' +
    balance)
})
