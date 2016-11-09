create table if not exists "L_ACCOUNTS" (
  "ACCOUNT_ID" integer not null primary key,
  "NAME" varchar(255),
  "BALANCE" float default 0 not null check ("BALANCE" >= "MINIMUM_ALLOWED_BALANCE"),
  "PASSWORD_HASH" varchar(1024),
  "PUBLIC_KEY" text,
  "IS_ADMIN" boolean default 0 not null,
  "IS_DISABLED" boolean default 0 not null,
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
  "TRANSFER_ID" integer not null primary key,
  "TRANSFER_UUID" char(36) not null unique,
  "LEDGER" varchar(1024),
  "ADDITIONAL_INFO" text,
  "STATUS_ID" integer not null,
  "REJECTION_REASON_ID" integer,
  "EXECUTION_CONDITION" text,
  "CANCELLATION_CONDITION" text,
  "EXPIRES_DTTM" datetime,
  "PROPOSED_DTTM" datetime,
  "PREPARED_DTTM" datetime,
  "EXECUTED_DTTM" datetime,
  "REJECTED_DTTM" datetime,
  FOREIGN KEY("REJECTION_REASON_ID") REFERENCES "L_LU_REJECTION_REASON"
    ("REJECTION_REASON_ID"),
  FOREIGN KEY("STATUS_ID") REFERENCES "L_LU_TRANSFER_STATUS" ("STATUS_ID")
);

create table if not exists "L_TRANSFER_ADJUSTMENTS"
(
  "TRANSFER_ADJUSTMENT_ID" integer not null primary key,
  "TRANSFER_ID" integer not null,
  "ACCOUNT_ID" integer not null,
  "DEBIT_CREDIT" varchar(10) not null,
  "AMOUNT" float DEFAULT 0 not null,
  "IS_AUTHORIZED" boolean default 0 not null,
  "IS_REJECTED" boolean default 0 not null,
  "REJECTION_MESSAGE" text,
  "MEMO" varchar(4000) null,
  FOREIGN KEY("TRANSFER_ID") REFERENCES "L_TRANSFERS" ("TRANSFER_ID"),
  FOREIGN KEY("ACCOUNT_ID") REFERENCES "L_ACCOUNTS" ("ACCOUNT_ID")
);

create table if not exists "L_ENTRIES" (
  "ENTRY_ID" integer not null primary key,
  "TRANSFER_ID" integer not null,
  "ACCOUNT_ID" integer not null,
  "CREATED_DTTM" datetime default CURRENT_TIMESTAMP
);

create table if not exists "L_FULFILLMENTS" (
  "FULFILLMENT_ID" integer not null primary key,
  "TRANSFER_ID" integer,
  "CONDITION_FULFILLMENT" text
);

create unique index fulfillments_transfer_id_index on "L_FULFILLMENTS"
  ("TRANSFER_ID");


INSERT INTO "L_LU_REJECTION_REASON" ("REJECTION_REASON_ID", "NAME", "DESCRIPTION")
  VALUES (0, 'cancelled', 'The transfer was cancelled');
INSERT INTO "L_LU_REJECTION_REASON" ("REJECTION_REASON_ID", "NAME", "DESCRIPTION")
  VALUES (1, 'expired', 'The transfer expired automatically');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (0, 'proposed');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (1, 'prepared');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (2, 'executed');
INSERT INTO "L_LU_TRANSFER_STATUS" ("STATUS_ID", "NAME") VALUES (3, 'rejected');
