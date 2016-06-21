create table if not exists "L_ACCOUNTS" (
  "ACCOUNT_ID" integer not null primary key,
  "NAME" varchar(255),
  "BALANCE" float default 0 not null check ("BALANCE" >= "MINIMUM_ALLOWED_BALANCE"),
  "CONNECTOR" varchar(1024),
  "PASSWORD_HASH" varchar(1024),
  "PUBLIC_KEY" text,
  "IS_ADMIN" boolean,
  "IS_DISABLED" boolean,
  "FINGERPRINT" varchar(255),
  "MINIMUM_ALLOWED_BALANCE" float default 0
);

create unique index accounts_name_unique on "L_ACCOUNTS"
  ("NAME");
create index fingerprint on "L_ACCOUNTS"
  ("FINGERPRINT");


create table if not exists "L_LU_REJECTION_REASON" (
  "REJECTION_REASON_ID" integer not null primary key,
  "NAME" varchar(10) not null,
  "DESCRIPTION" varchar(255) null
);

create unique index rejection_reason_name on "L_LU_REJECTION_REASON"
  ("NAME");


create table if not exists "L_LU_TRANSFER_STATUS" (
  "STATUS_ID" integer not null primary key,
  "NAME" varchar(20) not null,
  "DESCRIPTION" varchar(255) null
);

create unique index transfer_status_name on "L_LU_TRANSFER_STATUS"
  ("NAME");


create table if not exists "L_TRANSFERS" (
  "TRANSFER_ID" char(36) not null primary key,
  "LEDGER" varchar(1024),
  "DEBITS" text,
  "CREDITS" text,
  "ADDITIONAL_INFO" text,
  "STATUS_ID" integer not null,
  "REJECTION_REASON_ID" integer,
  "EXECUTION_CONDITION" text,
  "CANCELLATION_CONDITION" text,
  "EXPIRES_AT" datetime,
  "PROPOSED_AT" datetime,
  "PREPARED_AT" datetime,
  "EXECUTED_AT" datetime,
  "REJECTED_AT" datetime,
  FOREIGN KEY("REJECTION_REASON_ID") REFERENCES "L_LU_REJECTION_REASON"
    ("REJECTION_REASON_ID"),
  FOREIGN KEY("STATUS_ID") REFERENCES "L_LU_TRANSFER_STATUS" ("STATUS_ID")
);


create table if not exists "L_SUBSCRIPTIONS" (
  "SUBSCRIPTION_ID" char(36) not null primary key,
  "OWNER" varchar(1024),
  "EVENT" varchar(255),
  "SUBJECT" varchar(1024),
  "TARGET" varchar(1024),
  "IS_DELETED" boolean default 0
);

create index subscriptions_id_is_deleted_index on "L_SUBSCRIPTIONS"
  ("SUBSCRIPTION_ID", "IS_DELETED");


create table if not exists "L_NOTIFICATIONS" (
  "NOTIFICATION_ID" char(36) not null primary key,
  "SUBSCRIPTION_ID" char(36),
  "TRANSFER_ID" char(36),
  "RETRY_COUNT" integer,
  "RETRY_AT" datetime
);

create index notifications_retry_at_index on "L_NOTIFICATIONS"
  ("RETRY_AT");
create index subscription_transfer on "L_NOTIFICATIONS"
  ("SUBSCRIPTION_ID", "TRANSFER_ID");


create table if not exists "L_ENTRIES" (
  "ENTRY_ID" integer not null primary key,
  "TRANSFER_ID" char(36),
  "ACCOUNT" integer,
  "CREATED_AT" datetime default CURRENT_TIMESTAMP
);


create table if not exists "L_FULFILLMENTS" (
  "FULFILLMENT_ID" integer not null primary key,
  "TRANSFER_ID" char(36),
  "CONDITION_FULFILLMENT" text
);

create index fulfillments_transfer_id_index on "L_FULFILLMENTS"
  ("TRANSFER_ID");


INSERT INTO "L_LU_REJECTION_REASON" ("REJECTION_REASON_ID", "NAME", "DESCRIPTION")
  VALUES (0, 'cancelled', 'The transfer was cancelled');
INSERT INTO "L_LU_REJECTION_REASON" ("REJECTION_REASON_ID", "NAME", "DESCRIPTION")
  VALUES (1, 'expired', 'The transfer expired automatically');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (0, 'proposed');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (1, 'prepared');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (2, 'executed');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (3, 'rejected');
