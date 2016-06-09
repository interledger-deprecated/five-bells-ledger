'use strict'

const _ = require('lodash')
const assert = require('assert')
const knex = require('../../lib/knex').knex

const TABLE_NAME = 'L_NOTIFICATIONS'

function convertFromPersistent (data) {
  const result = _.mapKeys(_.cloneDeep(data), (value, key) => key.toLowerCase())
  result.id = result.notification_id
  delete result.notification_id
  delete result.created_at
  delete result.updated_at
  return result
}

function convertToPersistent (data) {
  const result = _.cloneDeep(data)
  result.notification_id = result.id
  delete result.id
  return _.mapKeys(result, (value, key) => key.toUpperCase())
}

function getTransaction (options) {
  return !options ? knex : (!options.transaction ? knex : options.transaction)
}

function * getNotificationWhere (where, options) {
  return getTransaction(options)
    .from(TABLE_NAME).select().where(where)
    .then((results) => {
      if (results.length === 1) {
        return convertFromPersistent(results[0])
      } else if (results.length === 0) {
        return null
      } else {
        assert(false, 'Multiple notifications matching ' + JSON.stringify(where))
      }
    })
}

function * getNotification (id, options) {
  return yield getNotificationWhere({NOTIFICATION_ID: id}, options)
}

function * getMatchingNotification (subscriptionID, transferID, options) {
  return yield getNotificationWhere({
    SUBSCRIPTION_ID: subscriptionID,
    TRANSFER_ID: transferID
  }, options)
}

function * getReadyNotifications (options) {
  return getTransaction(options).from(TABLE_NAME)
    .select()
    .where('RETRY_AT', null)
    .orWhere('RETRY_AT', '<', new Date(Date.now() + 100))
    .then((results) => results.map(convertFromPersistent))
}

function * getEarliestNotification (options) {
  return getTransaction(options).from(TABLE_NAME)
    .select()
    .whereNot('RETRY_AT', null)
    .orderBy('RETRY_AT', 'ASC')
    .limit(1)
    .then((results) => results && results[0] && convertFromPersistent(results[0]))
}

function * insertNotification (notifications, options) {
  return getTransaction(options)
    .insert(convertToPersistent(notifications))
    .into(TABLE_NAME)
}

function * updateNotification (notification, options) {
  return getTransaction(options)(TABLE_NAME)
    .update(convertToPersistent(notification))
    .where('NOTIFICATION_ID', notification.id)
}

function * deleteNotification (notificationID, options) {
  return getTransaction(options)
    .from(TABLE_NAME).where({NOTIFICATION_ID: notificationID}).delete()
}

module.exports = {
  getNotification,
  getMatchingNotification,
  getReadyNotifications,
  getEarliestNotification,
  insertNotification,
  updateNotification,
  deleteNotification,
  convertFromPersistent
}
