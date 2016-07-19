'use strict'

const _ = require('lodash')

function removeAuditFields (data) {
  return _.omit(data, ['db_created_dttm', 'db_updated_dttm', 'db_updated_user'])
}

module.exports = {
  removeAuditFields
}
