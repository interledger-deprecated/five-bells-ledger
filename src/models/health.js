'use strict'

const db = require('../lib/db')

async function getDbHealth () {
  const isConnected = await db.isConnected()
  return isConnected ? {
    status: 'OK'
  } : {
    status: 'NOT OK'
  }
}

module.exports = {
  getDbHealth
}
