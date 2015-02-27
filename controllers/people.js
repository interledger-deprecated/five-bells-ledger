/* @flow */
'use strict';

var uuid = require('uuid4');
var db = require('../services/db');
var log = require('../services/log')('people');
var request = require('../services/request');
var NotFoundError = require('../errors/not-found-error');

/**
 * @api {get} /people/:id Fetch user info
 * @apiName GetPerson
 * @apiGroup Person
 * @apiVersion 1.0.0
 *
 * @apiDescription Get information about a user.
 *
 * @apiParam {String} id Person's unique identifier
 *
 * @apiUse NotFoundError
 * @apiUse InvalidUriParameterError
 */
exports.fetch = function *fetch(id) {
  request.validateUriParameter('id', id, 'Identifier');
  log.debug('fetching person ID '+id);

  var person = yield db.get(['people', id]);
  if (!person) throw new NotFoundError('Unknown person ID');

  this.body = person;
};

exports.putResource = function *putResource(id) {
  request.validateUriParameter('id', id, 'Identifier');
  var person = yield request.validateBody(this, 'Person');

  person.id = id;

  var created = false;
  yield db.transaction(function *(tr) {
    var existingPerson = yield tr.get(['people', id]);

    if (existingPerson) {
      created = true;
    }

    tr.put(['people', id], person);
  });
  log.debug((created ? 'created' : 'updated') + ' person ID '+id);

  this.body = person;
  this.status = created ? 201 : 200;
}
