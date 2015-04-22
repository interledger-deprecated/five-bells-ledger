/* @flow */
'use strict';

const db = require('../services/db');
const log = require('five-bells-shared/services/log')('accounts');
const request = require('five-bells-shared/utils/request');
const NotFoundError = require('five-bells-shared/errors/not-found-error');
const config = require('../services/config');

exports.find = function *find() {
  const accounts = yield db.get(['accounts']);
  this.body = accounts;
};

/**
 * @api {get} /accounts/:id Fetch user info
 * @apiName GetAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Get information about a user.
 *
 * @apiParam {String} id Account's unique identifier
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 *
 * @param {String} id Account identifier (i.e. username)
 * @returns {void}
 */
exports.fetch = function *fetch(id) {
  request.validateUriParameter('id', id, 'Identifier');
  id = id.toLowerCase();
  log.debug('fetching account ID ' + id);

  const account = yield db.get(['accounts', id]);
  if (!account) {
    throw new NotFoundError('Unknown account ID');
  }

  // Externally we want to use a full URI ID
  account.id = config.server.base_uri + '/accounts/' + account.id;

  this.body = account;
};

/**
 * @api {put} /accounts/:id Update a user
 * @apiName PutAccount
 * @apiGroup Account
 * @apiVersion 1.0.0
 *
 * @apiDescription Create or update a user.
 *
 * @apiParam {String} id Account's unique identifier
 *
 * @apiUse InvalidUriParameterError
 * @apiUse InvalidBodyError
 *
 * @param {String} id Account identifier (i.e. username)
 * @return {void}
 */
exports.putResource = function *putResource(id) {
  request.validateUriParameter('id', id, 'Identifier');
  id = id.toLowerCase();
  const account = yield request.validateBody(this, 'Account');

  account.id = id;

  let existing = false;
  yield db.transaction(function *(tr) {
    const existingAccount = yield tr.get(['accounts', id]);

    if (existingAccount) {
      existing = true;
    }

    tr.put(['accounts', id], account);
  });
  log.debug((existing ? 'updated' : 'created') + ' account ID ' + id);

  // Externally we want to use a full URI ID
  account.id = config.server.base_uri + '/accounts/' + account.id;

  this.body = account;
  this.status = existing ? 200 : 201;
};
