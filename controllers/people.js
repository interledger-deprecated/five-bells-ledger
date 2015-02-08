/* @flow */
'use strict';

var uuid = require('node-uuid');
var db = require('../services/db');
var log = require('../services/log')('people');
var request = require('../services/request');
var NotFoundError = require('../errors/not-found-error');

exports.fetch = function *fetch(id) {
  request.uri('id', id, 'Identifier');
  log.debug('fetching person ID '+id);

  var person = yield db.get(['people', id]);
  if (!person) throw new NotFoundError('Unknown person ID');

  console.log(person);

  // Move the ID field to its canonical name
  person.id = person.id;
  delete person.id;

  this.body = person;
};
