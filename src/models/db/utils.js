'use strict'

const assert = require('assert')
const knex = require('../../lib/knex').knex
const InvalidModificationError = require('../../errors/invalid-modification-error')
const _ = require('lodash')

function createModule (tableName, convertToPersistent, convertFromPersistent) {
  function getTransaction (options) {
    return options && options.transaction ? options.transaction : knex
  }

  function select (where, transaction) {
    return (transaction || knex).from(tableName).select().where(where)
      .then((results) => results.map(convertFromPersistent))
  }

  function selectOne (where, transaction) {
    return (transaction || knex).from(tableName).select().where(where)
      .then((results) => {
        if (results.length === 1) {
          return convertFromPersistent(results[0])
        } else if (results.length === 0) {
          return null
        } else {
          assert(false, 'Multiple rows in ' + tableName + ' match ' +
            JSON.stringify(where))
        }
      })
  }

  function update (data, where, transaction) {
    return (transaction || knex)(tableName)
      .update(convertToPersistent(data)).where(where)
  }

  function insert (data, transaction) {
    return (transaction || knex).insert(convertToPersistent(data))
      .into(tableName)
  }

  function insertIgnore (data, transaction) {
    const dbType = knex.client.config.client
    if (dbType === 'pg') {
      const sql = knex('L_FULFILLMENTS').insert(convertToPersistent(data)).toString() + ' ON CONFLICT DO NOTHING'
      return (transaction || knex).raw(sql)
    } else {
      return insert(data, transaction)
    }
  }

  function insertAll (data, transaction) {
    return Promise.all(_.map(data.map(convertToPersistent), (tableRow) => {
      return (transaction || knex).insert(tableRow)
      .into(tableName)
    }))
  }

  function _upsert (data, where, transaction) {
    assert(transaction, 'transaction is required for upsert')
    return selectOne(where, transaction).then((existing) => {
      if (existing && existing.is_deleted) {
        throw new InvalidModificationError(
          'Already deleted, please use a new ID: ' + JSON.stringify(where))
      }
      const execute = existing
        ? update(data, where, transaction) : insert(data, transaction)
      return execute.then(() => Boolean(existing))
    })
  }

  function upsert (data, where, transaction) {
    if (transaction) {
      return _upsert(data, where, transaction)
    } else {
      return withTransaction((transaction) => _upsert(data, where, transaction))
    }
  }

  function withTransaction (callback) {
    return knex.transaction((transaction) => callback(transaction))
  }

  return {
    getTransaction,
    select,
    selectOne,
    update,
    insert,
    insertIgnore,
    insertAll,
    upsert,
    withTransaction
  }
}

module.exports = createModule
module.exports.client = knex.client.config.client
