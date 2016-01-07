'use strict'

module.exports = {
  up: function (queryInterface, Sequelize) {
    return queryInterface.renameColumn('Accounts', 'identity', 'connector')
  },

  down: function (queryInterface, Sequelize) {
    return queryInterface.renameColumn('Accounts', 'connector', 'identity')
  }
}
