'use strict'

const _ = require('lodash')
const co = require('co')
const utils = require('./notificationUtils')
const NotificationScheduler = require('five-bells-shared').NotificationScheduler
const transferDictionary = require('five-bells-shared').TransferStateDictionary
const transferStates = transferDictionary.transferStates
const knex = require('./knex').knex
const uuid4 = require('uuid4')

function * findOrCreate (Notification, data) {
  const options = {transaction: data.transaction}
  const result = yield Notification.findWhere(data.where, options)
  if (result.length) {
    return result
  }
  const values = _.assign({}, data.defaults, data.where)
  if (!values.id) {
    values.id = uuid4()
  }
  yield Notification.create(values, options)
  return yield Notification.findWhere(data.where, options)
}

class NotificationWorker {
  constructor (uri, log, Notification, Transfer, Subscription, Fulfillment, config) {
    this.uri = uri
    this.log = log
    this.Notification = Notification
    this.Transfer = Transfer
    this.Subscription = Subscription
    this.Fulfillment = Fulfillment
    this.config = config

    this.scheduler = new NotificationScheduler({
      Notification, knex, log,
      processNotification: this.processNotification.bind(this)
    })
  }

  start () { this.scheduler.start() }
  stop () { this.scheduler.stop() }
  processNotificationQueue () { return this.scheduler.processQueue() }

  * queueNotifications (transfer, transaction) {
    const affectedAccounts = _([transfer.debits, transfer.credits])
      .flatten().pluck('account').map((account) => this.uri.make('account', account)).value()
    affectedAccounts.push('*')
    let subscriptions = yield transaction.from('subscriptions')
      .whereIn('subject', affectedAccounts)
      .whereIn('event', ['transfer.update', 'transfer.*', '*'])
      .select().then()
    if (!subscriptions) {
      return
    }

    const fulfillment = yield this.Fulfillment.findByTransfer(transfer.id, { transaction })

    subscriptions = _.values(subscriptions)
    // log.debug('notifying ' + subscription.owner + ' at ' +
    //   subscription.target)
    const self = this
    const notifications = yield subscriptions.map(function (subscription) {
      return findOrCreate(self.Notification, {
        where: {
          subscription_id: subscription.id,
          transfer_id: transfer.id
        },
        transaction
      })
    })

    // We will schedule an immediate attempt to send the notification for
    // performance in the good case.
    // Don't schedule the immediate attempt if the worker isn't active, though.
    if (!this.scheduler.isEnabled()) return
    co(function * () {
      yield notifications.map(function (notification_and_created, i) {
        const notification = self.Notification.fromDatabaseModel(notification_and_created[0])
        return self.processNotificationWithInstances(notification, transfer, subscriptions[i], fulfillment)
      })
      // Schedule any retries.
      yield self.scheduler.scheduleProcessing()
    }).catch(function (err) {
      self.log.warn('immediate notification send failed ' + err.stack)
    })
  }

  * processNotification (notification) {
    notification = this.Notification.fromData(notification)
    const transfer = yield this.Transfer.findById(notification.transfer_id)
    const subscription = yield this.Subscription.findById(notification.subscription_id)
    const fulfillment = yield this.Fulfillment.findByTransfer(transfer.id)
    yield this.processNotificationWithInstances(notification, transfer, subscription, fulfillment)
  }

  * processNotificationWithInstances (notification, transfer, subscription, fulfillment) {
    this.log.debug('sending notification to ' + subscription.target)
    const subscriptionURI = this.uri.make('subscription', subscription.id)
    const notificationBody = {
      id: subscriptionURI + '/notifications/' + notification.id,
      subscription: subscriptionURI,
      event: 'transfer.update',
      resource: transfer.getDataExternal()
    }
    if (fulfillment) {
      if (transfer.state === transferStates.TRANSFER_STATE_EXECUTED) {
        notificationBody.related_resources = {
          execution_condition_fulfillment: fulfillment.getDataExternal()
        }
      } else if (transfer.state === transferStates.TRANSFER_STATE_REJECTED) {
        notificationBody.related_resources = {
          cancellation_condition_fulfillment: fulfillment.getDataExternal()
        }
      }
    }
    let retry = true
    try {
      const result = yield utils.sendNotification(
        subscription.target, notificationBody, this.config)
      // Success!
      if (result.statusCode < 400) {
        retry = false
      } else {
        this.log.debug('remote error for notification ' + result.statusCode,
          result.body)
        this.log.debug(notificationBody)
      }
    } catch (err) {
      this.log.debug('notification send failed ' + err)
    }

    if (retry) {
      yield this.scheduler.retryNotification(notification)
    } else {
      yield notification.destroy()
    }
  }
}

module.exports = NotificationWorker
