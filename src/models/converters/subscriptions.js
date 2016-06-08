'use strict'

const _ = require('lodash')
const uri = require('../../services/uriManager')

function convertToInternalSubscription (data) {
  data = _.cloneDeep(data)
  data.id = uri.parse(data.id, 'subscription').id.toLowerCase()
  return data
}

function convertToExternalSubscription (data) {
  data = _.cloneDeep(data)
  data.id = uri.make('subscription', data.id.toLowerCase())
  if (data.subject === null) delete data.subject

  delete data.is_deleted
  return data
}

module.exports = {
  convertToInternalSubscription,
  convertToExternalSubscription
}
