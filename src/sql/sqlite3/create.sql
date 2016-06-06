create table if not exists "L_ACCOUNTS" (
"ACCOUNT_ID" integer not null primary key,
"NAME" varchar(255),
"BALANCE" float check ("BALANCE" >= "MINIMUM_ALLOWED_BALANCE"),
"CONNECTOR" varchar(1024),
"PASSWORD_HASH" varchar(1024),
"PUBLIC_KEY" text,
"IS_ADMIN" boolean,
"IS_DISABLED" boolean,
"FINGERPRINT" varchar(255),
"MINIMUM_ALLOWED_BALANCE" float default 0);

create unique index accounts_name_unique on "L_ACCOUNTS" ("NAME");
create index fingerprint on "L_ACCOUNTS" ("FINGERPRINT");

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
