'use strict'

const _ = require('lodash')
const co = require('co')
const defer = require('co-defer')
const utils = require('./notificationUtils')

class NotificationWorker {
  constructor (uri, log, Notification, Transfer, Subscription, Fulfillment, config) {
    this._timeout = null

    this.uri = uri
    this.log = log
    this.Notification = Notification
    this.Transfer = Transfer
    this.Subscription = Subscription
    this.Fulfillment = Fulfillment
    this.config = config

    this.processingInterval = 1000
    this.initialRetryDelay = 2000
  }

  * start () {
    if (!this._timeout) {
      this._timeout = defer.setTimeout(this.processNotificationQueue.bind(this), this.processingInterval)
    }
  }

  * queueNotifications (transfer, transaction) {
    const affectedAccounts = _([transfer.debits, transfer.credits])
      .flatten().pluck('account').map((account) => this.uri.make('account', account)).value()
    affectedAccounts.push('*')

    let subscriptions = yield this.Subscription.findAll({
      where: {
        $and: [{
          $or: [{
            event: 'transfer.update'
          }, {
            event: 'transfer.*'
          }, {
            event: '*'
          }]
        }, {
          subject: {
            $in: affectedAccounts
          }
        }]
      },
      transaction
    })
    if (!subscriptions) {
      return
    }

    const fulfillment = yield this.Fulfillment.findByTransfer(transfer.id, { transaction })

    subscriptions = _.values(subscriptions)
    // log.debug('notifying ' + subscription.owner + ' at ' +
    //   subscription.target)
    ;(yield subscriptions.map((subscription) => {
      return this.Notification.findOrCreate({
        where: {
          subscription_id: subscription.id,
          transfer_id: transfer.id
        },
        defaults: {
          // Don't retry right away
          retry_at: new Date(Date.now() + this.initialRetryDelay)
        },
        transaction
      })
    })).forEach(function (notification_and_created, i) {
      let notification = notification_and_created[0]
      // We will schedule an immediate attempt to send the notification for
      // performance in the good case.
      co(this.processNotificationWithInstances(notification, transfer, subscriptions[i], fulfillment)).catch((err) => {
        this.log.debug('immediate notification send failed ' + err)
      })
    }, this)
  }

  scheduleProcessing () {
    if (this._timeout) {
      this.log.debug('scheduling notifications')
      clearTimeout(this._timeout)
      defer(this.processNotificationQueue.bind(this))
    }
  }

  * processNotificationQueue () {
    const notifications = yield this.Notification.findAll({
      where: {
        $or: [
          { retry_at: null },
          { retry_at: {lt: new Date()} }
        ]
      }
    })
    this.log.debug('processing ' + notifications.length + ' notifications')
    yield notifications.map(this.processNotification.bind(this))

    if (this._timeout && notifications.length) {
      clearTimeout(this._timeout)
      this._timeout = defer.setTimeout(this.processNotificationQueue.bind(this), this.processingInterval)
    }
  }

  * processNotification (notification) {
    const transfer = this.Transfer.fromDatabaseModel(yield notification.getDatabaseModel().getTransfer())
    const subscription = this.Subscription.fromDatabaseModel(yield notification.getDatabaseModel().getSubscription())
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
      if (transfer.state === 'executed') {
        notificationBody.related_resources = {
          execution_condition_fulfillment: fulfillment.getDataExternal()
        }
      } else if (transfer.state === 'rejected') {
        notificationBody.related_resources = {
          cancellation_condition_fulfillment: fulfillment.getDataExternal()
        }
      }
    }
    try {
      const result = yield utils.sendNotification(
        subscription.target, notificationBody, this.config)
      // Success!
      if (result.statusCode < 400) {
        yield notification.destroy()
        return
      }
      if (result.statusCode >= 400) {
        this.log.debug('remote error for notification ' + result.statusCode,
          result.body)
        this.log.debug(notificationBody)
      }
    } catch (err) {
      this.log.debug('notification send failed ' + err)
    }

    // Failed: retry soon (exponential backoff).
    let retries = notification.retry_count = (notification.retry_count || 0) + 1
    let delay = Math.min(120, Math.pow(2, retries))
    notification.retry_at = new Date(Date.now() + 1000 * delay)
    yield notification.save()
  }

  stop () {
    if (this._timeout) {
      clearTimeout(this._timeout)
      this._timeout = null
    }
  }
}

module.exports = NotificationWorker
