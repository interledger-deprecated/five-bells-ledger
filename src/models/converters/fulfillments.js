'use strict'

function convertToExternalFulfillment (data) {
  return {
    condition_fulfillment: data.condition_fulfillment,
    fulfillment_data: data.fulfillment_data
  }
}

function convertToInternalFulfillment (data) {
  return data
}

module.exports = {
  convertToExternalFulfillment,
  convertToInternalFulfillment
}
