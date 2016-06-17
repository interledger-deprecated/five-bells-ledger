create table if not exists "accounts" (
"id" integer not null primary key,
"name" varchar(255),
"balance" float default 0 check (balance >= minimum_allowed_balance) not null,
"connector" varchar(1024),
"password_hash" varchar(1024),
"public_key" text,
"is_admin" boolean,
"is_disabled" boolean,
"fingerprint" varchar(255),
"minimum_allowed_balance" float default 0);

create unique index accounts_name_unique on "accounts" ("name");
create index fingerprint on "accounts" ("fingerprint");

create table if not exists "transfers" (
"id" char(36) not null primary key,
"ledger" varchar(1024),
"debits" text,
"credits" text,
"additional_info" text,
"state" varchar,
"rejection_reason" varchar,
"execution_condition" text,
"cancellation_condition" text,
"expires_at" datetime,
"proposed_at" datetime,
"prepared_at" datetime,
"executed_at" datetime,
"rejected_at" datetime);

create table if not exists "subscriptions" (
"id" char(36),
"owner" varchar(1024),
"event" varchar(255),
"subject" varchar(1024),
"target" varchar(1024),
"is_deleted" boolean default 0,
primary key ("id"));

create index subscriptions_id_is_deleted_index
  on "subscriptions" ("id", "is_deleted");
create table if not exists "notifications" (
"id" char(36) not null primary key,
"subscription_id" char(36),
"transfer_id" char(36),
"retry_count" integer,
"retry_at" datetime);

create index notifications_retry_at_index on "notifications" ("retry_at");
create index subscription_transfer
  on "notifications" ("subscription_id", "transfer_id");

create table if not exists "entries" (
"id" integer not null primary key,
"transfer_id" char(36),
"account" integer,
"created_at" datetime default CURRENT_TIMESTAMP);

create table if not exists "fulfillments" (
"id" integer not null primary key,
"transfer_id" char(36),
"condition_fulfillment" text);

create index fulfillments_transfer_id_index on "fulfillments" ("transfer_id");
