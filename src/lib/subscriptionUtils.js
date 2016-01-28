'use strict'

const uri = require('../services/uriManager')

function isOwnerOrAdmin (requestingUser, subscription) {
  const requestOwner = uri.make('account', requestingUser.name)
  return requestOwner === subscription.owner || requestingUser.is_admin
}

function isSubjectOrAdmin (requestingUser, subscription) {
  const requestOwner = uri.make('account', requestingUser.name)
  return requestOwner === subscription.subject || requestingUser.is_admin
}

module.exports = {
  isOwnerOrAdmin,
  isSubjectOrAdmin
}
