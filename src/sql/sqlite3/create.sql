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

create table if not exists "L_TRANSFERS" (
"TRANSFER_ID" char(36) not null primary key,
"LEDGER" varchar(1024),
"DEBITS" text,
"CREDITS" text,
"ADDITIONAL_INFO" text,
"STATE" varchar,
"REJECTION_REASON" varchar,
"EXECUTION_CONDITION" text,
"CANCELLATION_CONDITION" text,
"EXPIRES_AT" datetime,
"PROPOSED_AT" datetime,
"PREPARED_AT" datetime,
"EXECUTED_AT" datetime,
"REJECTED_AT" datetime);

create table if not exists "L_SUBSCRIPTIONS" (
"SUBSCRIPTION_ID" char(36),
"OWNER" varchar(1024),
"EVENT" varchar(255),
"SUBJECT" varchar(1024),
"TARGET" varchar(1024),
"IS_DELETED" boolean default 0,
primary key ("SUBSCRIPTION_ID"));

create index subscriptions_id_is_deleted_index
  on "L_SUBSCRIPTIONS" ("SUBSCRIPTION_ID", "IS_DELETED");

create table if not exists "L_NOTIFICATIONS" (
"NOTIFICATION_ID" char(36) not null primary key,
"SUBSCRIPTION_ID" char(36),
"TRANSFER_ID" char(36),
"RETRY_COUNT" integer,
"RETRY_AT" datetime);

create index notifications_retry_at_index on "L_NOTIFICATIONS" ("RETRY_AT");
create index subscription_transfer
  on "L_NOTIFICATIONS" ("SUBSCRIPTION_ID", "TRANSFER_ID");

create table if not exists "L_ENTRIES" (
"ENTRY_ID" integer not null primary key,
"TRANSFER_ID" char(36),
"ACCOUNT" integer,
"CREATED_AT" datetime default CURRENT_TIMESTAMP);

create table if not exists "L_FULFILLMENTS" (
"FULFILLMENT_ID" integer not null primary key,
"TRANSFER_ID" char(36),
"CONDITION_FULFILLMENT" text);

create index fulfillments_transfer_id_index on "L_FULFILLMENTS" ("TRANSFER_ID");
