'use strict'

module.exports = {
  up: function (queryInterface, Sequelize) {
    queryInterface.createTable('Accounts', {
      primary: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, unique: true },
      balance: Sequelize.DECIMAL(10, 2),
      identity: Sequelize.STRING(1024),
      password: Sequelize.STRING,
      public_key: Sequelize.TEXT,
      is_admin: Sequelize.BOOLEAN,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    })

    queryInterface.createTable('Transfers', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true
      },
      ledger: Sequelize.STRING(1024),
      debits: Sequelize.TEXT,
      credits: Sequelize.TEXT,
      part_of_payment: Sequelize.STRING(1024),
      state: Sequelize.ENUM('proposed', 'pre_prepared', 'prepared', 'pre_executed', 'executed', 'rejected'),
      execution_condition: Sequelize.TEXT,
      execution_condition_fulfillment: Sequelize.TEXT,
      cancellation_condition: Sequelize.TEXT,
      cancellation_condition_fulfillment: Sequelize.TEXT,
      expires_at: Sequelize.DATE,
      timeline: Sequelize.TEXT,
      proposed_at: Sequelize.DATE,
      pre_prepared_at: Sequelize.DATE,
      prepared_at: Sequelize.DATE,
      pre_executed_at: Sequelize.DATE,
      executed_at: Sequelize.DATE,
      rejected_at: Sequelize.DATE,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    })

    queryInterface.createTable('Subscriptions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true
      },
      owner: Sequelize.STRING(1024),
      event: Sequelize.STRING,
      subject: Sequelize.STRING(1024),
      target: Sequelize.STRING(1024),
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    })

    queryInterface.createTable('EntryGroups', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    })

    queryInterface.createTable('Entries', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      entry_group: Sequelize.INTEGER,
      transfer_id: Sequelize.UUID,
      account: Sequelize.INTEGER,
      balance: Sequelize.DECIMAL(10, 2),
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    }).then(function () {
      queryInterface.addIndex('Entries', ['account', 'entry_group'])
    })
  },

  down: function (queryInterface, Sequelize) {
    queryInterface.dropTable('Accounts')
    queryInterface.dropTable('Transfers')
    queryInterface.dropTable('Subscriptions')
    queryInterface.dropTable('EntryGroups')
    queryInterface.removeIndex('Entries', ['account', 'entry_group'])
    queryInterface.dropTable('Entries')
  }
}
