'use strict'

function convertToExternalFulfillment (data) {
  return data.condition_fulfillment
}

function convertToInternalFulfillment (data) {
  return {
    condition_fulfillment: data
  }
}

module.exports = {
  convertToExternalFulfillment,
  convertToInternalFulfillment
}
