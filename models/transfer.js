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
      return data
    })
    this.addOutputFilter(function (data) {
      data.id = uri.make('transfer', data.id.toLowerCase())
      return data
    })
  }
}

Transfer.setSchema(validate, 'Transfer')

exports.Transfer = Transfer
