'use strict'

const _ = require('lodash')
const defer = require('co-defer')
const request = require('co-request')

class NotificationWorker {
  constructor (uri, log, Notification, Transfer, Subscription) {
    this._timeout = null

    this.uri = uri
    this.log = log
    this.Notification = Notification
    this.Transfer = Transfer
    this.Subscription = Subscription

    this.processingInterval = 1000
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

    if (subscriptions) {
      subscriptions = _.values(subscriptions)
        // log.debug('notifying ' + subscription.owner + ' at ' +
        //   subscription.target)
        //
      yield subscriptions.map((subscription) => {
        return this.Notification.upsert({
          subscription_id: subscription.id,
          transfer_id: transfer.id
        }, { transaction })
      })
    }
  }

  scheduleProcessing () {
    if (this._timeout) {
      this.log.debug('scheduling notifications')
      clearTimeout(this._timeout)
      defer(this.processNotificationQueue.bind(this))
    }
  }

  * processNotificationQueue () {
    const notifications = yield this.Notification.findAll()
    for (let notification of notifications) {
      const transfer = this.Transfer.fromDatabaseModel(yield notification.getDatabaseModel().getTransfer())
      const subscription = this.Subscription.fromDatabaseModel(yield notification.getDatabaseModel().getSubscription())
      this.log.debug('sending notification to ' + subscription.target)
      const notificationBody = {
        id: this.uri.make('subscription', subscription.id),
        event: 'transfer.update',
        resource: transfer.getDataExternal()
      }
      try {
        const result = yield request(subscription.target, {
          method: 'post',
          json: true,
          body: notificationBody
        })
        if (result.statusCode >= 400) {
          this.log.debug('remote error for notification ' + result.statusCode,
            result.body)
          this.log.debug(notificationBody)
        }
      } catch (err) {
        this.log.debug('notification send failed ' + err)
      }
      yield notification.destroy()
    }

    if (this._timeout && notifications.length) {
      clearTimeout(this._timeout)
      this._timeout = defer.setTimeout(this.processNotificationQueue.bind(this), this.processingInterval)
    }
  }

  stop () {
    if (this._timeout) {
      clearTimeout(this._timeout)
      this._timeout = null
    }
  }
}

module.exports = NotificationWorker
