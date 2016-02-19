'use strict'

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentKnexModelMixin
const knex = require('../../lib/knex').knex

class EntryGroup extends Model {
  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    return data
  }
}

EntryGroup.tableName = 'entry_groups'
PersistentModelMixin(EntryGroup, knex)

exports.EntryGroup = EntryGroup
