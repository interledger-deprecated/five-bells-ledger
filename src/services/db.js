'use strict'

const Sequelize = require('sequelize')
const config = require('./config')
const log = require('./log')('db')
const DB = require('@ripple/five-bells-shared').DB(Sequelize, log)

module.exports = new DB(config.db.uri)
