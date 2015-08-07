'use strict'

const Model = require('@ripple/five-bells-shared/lib/model').Model
const validate = require('@ripple/five-bells-shared/services/validate')
const uri = require('../services/uriManager')

class Transfer extends Model {
  constructor () {
    super()
    this.addInputFilter(function (data) {
      // ID is optional on the incoming side
      if (data.id) {
        data.id = uri.parse(data.id, 'transfer').id.toLowerCase()
      }
      for (let debit of data.debits) {
        debit.account = uri.parse(debit.account, 'account').id.toLowerCase()
      }
      for (let credit of data.credits) {
        credit.account = uri.parse(credit.account, 'account').id.toLowerCase()
      }
      return data
    })
    this.addOutputFilter(function (data) {
      data.id = uri.make('transfer', data.id.toLowerCase())

      for (let debit of data.debits) {
        debit.account = uri.make('account', debit.account)
      }
      for (let credit of data.credits) {
        credit.account = uri.make('account', credit.account)
      }
      return data
    })
  }

  save (tr) {
    tr.put(['transfers', this.id], this.getDataRaw())
  }
}

Transfer.setSchema(validate, 'Transfer')

Transfer.get = function * (id, tr) {
  return Transfer.fromDataRaw(yield tr.get(['transfers', id]))
}

exports.Transfer = Transfer
