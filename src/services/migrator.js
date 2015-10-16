const db = require('./db')
const Umzug = require('umzug')

const migrator = new Umzug({
  sequelize: db
})

module.exports = migrator
