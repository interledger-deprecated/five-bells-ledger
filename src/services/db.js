'use strict'

const Sequelize = require('sequelize')
const config = require('./config')
const log = require('./log')('db')
const DB = require('five-bells-shared').DB(Sequelize)
var pg = require('pg')
delete pg.native

module.exports = new DB(config.getIn(['db', 'uri']), {
  logging: log.debug
})
