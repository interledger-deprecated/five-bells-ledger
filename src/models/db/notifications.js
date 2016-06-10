'use strict'

const TABLE_NAME = 'L_NOTIFICATIONS'
const _ = require('lodash')
const db = require('./utils')(TABLE_NAME,
  convertToPersistent, convertFromPersistent)

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

function * getNotification (id, options) {
  return db.selectOne({NOTIFICATION_ID: id}, options && options.transaction)
}

function * getMatchingNotification (subscriptionID, transferID, options) {
  return db.selectOne({
    SUBSCRIPTION_ID: subscriptionID,
    TRANSFER_ID: transferID
  }, options && options.transaction)
}

function * getReadyNotifications (options) {
  return db.getTransaction(options).from(TABLE_NAME)
    .select()
    .where('RETRY_AT', null)
    .orWhere('RETRY_AT', '<', new Date(Date.now() + 100))
    .then((results) => results.map(convertFromPersistent))
}

function * getEarliestNotification (options) {
  return db.getTransaction(options).from(TABLE_NAME)
    .select()
    .whereNot('RETRY_AT', null)
    .orderBy('RETRY_AT', 'ASC')
    .limit(1)
    .then((results) => results && results[0] && convertFromPersistent(results[0]))
}

function * insertNotification (notification, options) {
  return db.insert(notification, options && options.transaction)
}

function * updateNotification (notification, options) {
  return db.update(notification, {NOTIFICATION_ID: notification.id},
    options && options.transaction)
}

function * deleteNotification (notificationID, options) {
  return db.getTransaction(options)
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
