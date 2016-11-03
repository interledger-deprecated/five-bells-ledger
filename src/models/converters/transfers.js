'use strict'

const _ = require('lodash')
const uri = require('../../services/uriManager')

function convertToInternalTransfer (data) {
  // ID is optional on the incoming side
  data = _.cloneDeep(data)
  if (data.id && data.id.startsWith('http')) {
    data.id = uri.parse(data.id, 'transfer').id.toLowerCase()
  }
  data.debit_account = uri.parse(data.debit_account, 'account').name.toLowerCase()
  data.credit_account = uri.parse(data.credit_account, 'account').name.toLowerCase()

  if (typeof data.timeline === 'object') {
    data.prepared_at = data.timeline.prepared_at
    data.executed_at = data.timeline.executed_at
    data.rejected_at = data.timeline.rejected_at
    delete data.timeline
  }

  if (typeof data.expires_at === 'string') {
    data.expires_at = new Date(data.expires_at)
  }

  return data
}

function convertToExternalTransfer (data) {
  data = _.cloneDeep(data)
  data.id = uri.make('transfer', data.id.toLowerCase())

  data.debit_account = uri.make('account', data.debit_account)
  data.credit_account = uri.make('account', data.credit_account)

  const timelineProperties = [
    'prepared_at',
    'executed_at',
    'rejected_at'
  ]

  data.timeline = _.pick(data, timelineProperties)
  data = _.omit(data, timelineProperties)
  if (_.isEmpty(data.timeline)) delete data.timeline

  if (data.expires_at instanceof Date) {
    data.expires_at = data.expires_at.toISOString()
  }

  return data
}

module.exports = {
  convertToExternalTransfer,
  convertToInternalTransfer
}
