'use strict'

const db = require('../../services/db')

exports.reset = function () {
  return db.remove()
}
