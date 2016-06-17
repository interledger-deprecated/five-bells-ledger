'use strict'

const _ = require('lodash')
const uri = require('../../services/uriManager')

function convertToInternalTransfer (data) {
  // ID is optional on the incoming side
  data = _.cloneDeep(data)
  if (data.id && data.id.startsWith('http')) {
    data.id = uri.parse(data.id, 'transfer').id.toLowerCase()
  }
  data.debits = _.sortBy(data.debits, (debit) => debit.account)
  data.credits = _.sortBy(data.credits, (credit) => credit.account)
  for (let debit of data.debits) {
    debit.account = uri.parse(debit.account, 'account').name.toLowerCase()
  }
  for (let credit of data.credits) {
    credit.account = uri.parse(credit.account, 'account').name.toLowerCase()
  }

  if (typeof data.timeline === 'object') {
    data.proposed_at = data.timeline.proposed_at
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

  for (let debit of data.debits) {
    debit.account = uri.make('account', debit.account)
  }
  for (let credit of data.credits) {
    credit.account = uri.make('account', credit.account)
  }

  const timelineProperties = [
    'proposed_at',
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
