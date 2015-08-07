'use strict'

const Model = require('@ripple/five-bells-shared/lib/model').Model
const validate = require('@ripple/five-bells-shared/services/validate')
const uri = require('../services/uriManager')

class Account extends Model {
  constructor () {
    super()
    this.addInputFilter(function (data) {
      // ID is optional on the incoming side
      if (data.id) {
        data.id = uri.parse(data.id, 'account').id.toLowerCase()
      }
      return data
    })
    this.addOutputFilter(function (data) {
      data.id = uri.make('account', data.id.toLowerCase())
      return data
    })
  }

  save (tr) {
    tr.put(['accounts', this.id], this.getDataRaw())
  }
}

Account.setSchema(validate, 'Account')

Account.get = function * (id, tr) {
  return Account.fromDataRaw(yield tr.get(['accounts', id]))
}

exports.Account = Account
