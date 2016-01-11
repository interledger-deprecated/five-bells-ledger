'use strict';

module.exports = {
  up: function (queryInterface, Sequelize) {
    queryInterface.addColumn('Transfers', 'additional_info', Sequelize.TEXT)
    queryInterface.removeColumn('Transfers', 'part_of_payment')
  },

  down: function (queryInterface, Sequelize) {
    queryInterface.removeColumn('Transfers', 'additional_info')
    queryInterface.addColumn('Transfers', 'part_of_payment', Sequelize.STRING(1024))
  }
};
