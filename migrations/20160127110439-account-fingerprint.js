'use strict';

module.exports = {
  up: function (queryInterface, Sequelize) {
    queryInterface.addColumn('Accounts', 'fingerprint', Sequelize.STRING)
  },

  down: function (queryInterface, Sequelize) {
    queryInterface.removeColumn('Accounts', 'fingerprint')
  }
};
