'use strict'

function createAccountsTable (knex) {
  return knex.schema.createTableIfNotExists('accounts', (table) => {
    table.increments()
    table.string('name').unique()
    table.decimal('balance', 10, 2)
    table.string('connector', 1024)
    table.string('password_hash')
    table.text('public_key')
    table.boolean('is_admin')
    table.boolean('is_disabled')
    table.string('fingerprint').index('fingerprint')
  })
}

function createFulfillmentsTable (knex) {
  return knex.schema.createTableIfNotExists('fulfillments', (table) => {
    table.increments()
    table.uuid('transfer_id').references('id').inTable('transfers').index()
    table.text('condition_fulfillment')
  })
}

function createEntriesTable (knex) {
  return knex.schema.createTableIfNotExists('entries', (table) => {
    table.increments()
    // A FK references to transfers table will cause an error here
    // there are cases in which an entry is inserted before the corresponding transfer is inserted
    table.uuid('transfer_id')
    table.integer('account')
    table.decimal('balance', 10, 2)
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })
}

function createNotificationsTable (knex) {
  return knex.schema.createTableIfNotExists('notifications', (table) => {
    table.uuid('id').primary()
    table.uuid('subscription_id')
    table.uuid('transfer_id').references('id').inTable('transfers')
    table.integer('retry_count')
    table.datetime('retry_at').index()
    table.index(['subscription_id', 'transfer_id'], 'subscription_transfer')
  })
}

function createSubscriptionsTable (knex) {
  return knex.schema.createTableIfNotExists('subscriptions', (table) => {
    table.uuid('id').primary()
    table.string('owner', 1024)
    table.string('event')
    table.string('subject', 1024)
    table.string('target', 1024)
  })
}

function createTransfersTable (knex) {
  return knex.schema.createTableIfNotExists('transfers', (table) => {
    table.uuid('id').primary()
    table.string('ledger', 1024)
    table.text('debits')
    table.text('credits')
    table.text('additional_info')
    table.enu('state', ['proposed', 'prepared', 'executed', 'rejected'])
    table.enu('rejection_reason', ['expired', 'cancelled'])
    table.text('execution_condition')
    table.text('cancellation_condition')
    table.datetime('expires_at')
    table.datetime('proposed_at')
    table.datetime('prepared_at')
    table.datetime('executed_at')
    table.datetime('rejected_at')
  })
}

exports.up = function (knex, Promise) {
  return Promise.all([
    createAccountsTable(knex),
    createTransfersTable(knex),
    createSubscriptionsTable(knex),
    createNotificationsTable(knex),
    createEntriesTable(knex),
    createFulfillmentsTable(knex)
  ])
}

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTableIfExists('fulfillments'),
    knex.schema.dropTableIfExists('entries'),
    knex.schema.dropTableIfExists('notifications'),
    knex.schema.dropTableIfExists('subscriptions'),
    knex.schema.dropTableIfExists('transfers'),
    knex.schema.dropTableIfExists('accounts')
  ])
}
