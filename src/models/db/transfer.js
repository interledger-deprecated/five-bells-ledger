'use strict'

const _ = require('lodash')

const Model = require('five-bells-shared').Model
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin
const validator = require('../../services/validator')
const uri = require('../../services/uriManager')

const Sequelize = require('sequelize')
const JsonField = require('sequelize-json')
const sequelize = require('../../services/db')

const FINAL_STATES = ['executed', 'failed', 'rejected']

class Transfer extends Model {
  static convertFromExternal (data) {
    // ID is optional on the incoming side
    if (data.id) {
      data.id = uri.parse(data.id, 'transfer').id.toLowerCase()
    }
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

  static convertToExternal (data) {
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

  static convertFromPersistent (data) {
    delete data.created_at
    delete data.updated_at
    data = _.omit(data, _.isNull)
    return data
  }

  static convertToPersistent (data) {
    return data
  }

  isFinalized () {
    return _.includes(FINAL_STATES, this.state)
  }
}

Transfer.validateExternal = validator.create('Transfer')

PersistentModelMixin(Transfer, sequelize, {
  id: {
    type: Sequelize.UUID,
    primaryKey: true
  },
  ledger: Sequelize.STRING(1024),
  debits: JsonField(sequelize, 'Transfer', 'debits'),
  credits: JsonField(sequelize, 'Transfer', 'credits'),
  additional_info: JsonField(sequelize, 'Transfer', 'additional_info'),
  state: Sequelize.ENUM('proposed', 'prepared', 'executed', 'rejected'),
  rejection_reason: Sequelize.ENUM('expired', 'cancelled'),
  execution_condition: JsonField(sequelize, 'Transfer', 'execution_condition'),
  cancellation_condition: JsonField(sequelize, 'Transfer', 'cancellation_condition'),
  expires_at: Sequelize.DATE,
  proposed_at: Sequelize.DATE,
  prepared_at: Sequelize.DATE,
  executed_at: Sequelize.DATE,
  rejected_at: Sequelize.DATE
})

exports.Transfer = Transfer
