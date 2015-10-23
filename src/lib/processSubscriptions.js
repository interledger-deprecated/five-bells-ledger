'use strict'

const _ = require('lodash')
const request = require('co-request')
const log = require('../services/log')('processSubscriptions')
const Subscription = require('../models/subscription').Subscription
const uri = require('../services/uriManager')

function * processSubscriptions (transfer) {
  // TODO Get subscriptions for affected accounts only
  // TODO Get subscriptions for specific events only
  // const affectedAccounts = _([debitAccounts, creditAccounts])
  //   .map(_.keys).flatten().value()
  //
  // function getSubscriptions(account) {
  //   return db.get(['accounts', account, 'subscriptions'])
  // }
  // let subscriptions = (yield affectedAccounts.map(getSubscriptions))
  let subscriptions = yield Subscription.findAll()

  if (subscriptions) {
    subscriptions = _.values(subscriptions)

    const notifications = subscriptions.map(function (subscription) {
      log.debug('notifying ' + subscription.owner + ' at ' +
        subscription.target)

      return request(subscription.target, {
        method: 'post',
        json: true,
        body: {
          id: uri.make('subscription', subscription.id),
          event: 'transfer.update',
          resource: transfer.getDataExternal()
        }
      })
    })

    for (let result of yield notifications) {
      if (result.statusCode >= 400) {
        log.debug('remote error for notification ' + result.statusCode,
          result.body)
      }
    }
  }
}

module.exports = processSubscriptions
