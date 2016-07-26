'use strict'

const db = require('../lib/db')

function * getDbHealth () {
  const isConnected = yield db.isConnected()
  return isConnected ? {
    status: 'OK'
  } : {
    status: 'NOT OK'
  }
}

module.exports = {
  getDbHealth
}
