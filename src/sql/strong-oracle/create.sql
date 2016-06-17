BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "accounts"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "subscriptions"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "entries"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "transfers"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "fulfillments"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "notifications"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'DROP SEQUENCE seq_l_account_pk';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -2289 THEN
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'DROP SEQUENCE seq_l_entries_pk';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -2289 THEN
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'DROP SEQUENCE seq_l_fulfillments_pk';
  EXCEPTION
  WHEN OTHERS THEN
  IF SQLCODE != -2289 THEN
    RAISE;
  END IF;
END;
/

CREATE SEQUENCE seq_l_account_pk
  INCREMENT BY 1
  START WITH 1
  NOCYCLE
  CACHE 100
  ORDER
/

CREATE SEQUENCE seq_l_entries_pk
  INCREMENT BY 1
  START WITH 1
  NOCYCLE
  CACHE 100
  ORDER
/

CREATE SEQUENCE seq_l_fulfillments_pk
  INCREMENT BY 1
  START WITH 1
  NOCYCLE
  CACHE 100
  ORDER
/

CREATE TABLE "accounts"
(
  "id"                   INTEGER  NOT NULL ,
  "name"                 VARCHAR2(255) NOT NULL ,
  "balance"              NUMBER(32,16) DEFAULT 0 NOT NULL ,
  "connector"            VARCHAR2(1024) NULL ,
  "password_hash"        VARCHAR2(1024) NULL ,
  "public_key"           VARCHAR2(4000) NULL ,
  "is_admin"             SMALLINT NULL ,
  "is_disabled"          SMALLINT NULL ,
  "fingerprint"          VARCHAR2(255) ,
  "minimum_allowed_balance" NUMBER(32,16) DEFAULT  0  NULL,
  CONSTRAINT "min_balance_constraint" CHECK ("balance" >= "minimum_allowed_balance")
)
/

CREATE INDEX XPKACCOUNTS ON "accounts"
  ("id"   ASC)
/

ALTER TABLE "accounts"
  ADD CONSTRAINT  PK_ACCOUNTS PRIMARY KEY ("id")
/

CREATE UNIQUE INDEX XAK1ACCOUNTS ON "accounts"
  ("name"   ASC)
/

ALTER TABLE "accounts"
  ADD CONSTRAINT  XAK1_ACCOUNTS UNIQUE ("name")
/

CREATE INDEX XIE1_FINGERPRINTS ON "accounts"
  ("fingerprint"   ASC)
/

CREATE TABLE "subscriptions"
(
  "id"                   VARCHAR2(64) NOT NULL ,
  "owner"                VARCHAR2(1024) NULL ,
  "event"                VARCHAR2(255)  DEFAULT  NULL  NULL ,
  "subject"              VARCHAR2(1024) NULL ,
  "target"               VARCHAR2(1024) DEFAULT  NULL  NULL ,
  "is_deleted"           SMALLINT DEFAULT 0 NOT NULL
)
/

CREATE INDEX XPKL_SUBSCRIPTIONS ON "subscriptions"
  ("id" ASC)
/

ALTER TABLE "subscriptions"
  ADD CONSTRAINT  PK_SUBSCRIPTIONS PRIMARY KEY ("id")
/

CREATE INDEX XIE1L_SUBSCRIPTIONS ON "subscriptions"
  ("is_deleted" ASC)
/

CREATE TABLE "transfers"
(
  "id"                   VARCHAR2(36)  NOT NULL ,
  "ledger"               VARCHAR2(1024) NULL ,
  "debits"               VARCHAR2(4000) NULL ,
  "credits"              VARCHAR2(4000) NULL ,
  "state"                VARCHAR2(4000) NULL ,
  "rejection_reason"     VARCHAR2(4000) NULL ,
  "additional_info"      VARCHAR2(4000) NULL ,
  "execution_condition"  VARCHAR2(4000) NULL ,
  "cancellation_condition" VARCHAR2(4000) NULL ,
  "expires_at"         TIMESTAMP NULL ,
  "proposed_at"        TIMESTAMP NULL ,
  "prepared_at"        TIMESTAMP NULL ,
  "executed_at"        TIMESTAMP NULL ,
  "rejected_at"        TIMESTAMP NULL
)
/

CREATE INDEX XPKL_TRANSFERS ON "transfers"
  ("id"   ASC)
/

ALTER TABLE "transfers"
  ADD CONSTRAINT  PK_TRANSFERS PRIMARY KEY ("id")
/

CREATE TABLE "entries"
(
  "id"                   INTEGER  NOT NULL ,
  "transfer_id"          VARCHAR2(64) NULL ,
  "account"              INTEGER NULL ,
  "created_at"           TIMESTAMP NOT NULL
)
/

CREATE INDEX XPKL_ENTRIES ON "entries"
  ("id"   ASC)
/

ALTER TABLE "entries"
  ADD CONSTRAINT  PK_ENTRIES PRIMARY KEY ("id")
/

CREATE INDEX XAK1L_ENTRIES ON "entries"
  ("transfer_id"   ASC, "account"   ASC)
/

CREATE INDEX XIF2L_ENTRIES ON "entries"
  ("account"   ASC)
/

CREATE INDEX XIF3L_ENTRIES ON "entries"
  ("transfer_id"   ASC)
/

CREATE INDEX XIE1L_ENTRIES ON "entries"
  ("created_at"   ASC)
/

CREATE TABLE "fulfillments"
(   "id"       INTEGER NOT NULL ,
  "transfer_id"          VARCHAR2(64) NULL ,
  "condition_fulfillment" VARCHAR2(4000) NULL
)
/

CREATE INDEX XPKL_FULFILLMENTS ON "fulfillments"
  ("id"   ASC)
/

ALTER TABLE "fulfillments"
  ADD CONSTRAINT  PK_FULFILLMENTS PRIMARY KEY ("id")
/

CREATE INDEX XIF1L_FULFILLMENTS ON "fulfillments"
  ("transfer_id"   ASC)
/

CREATE TABLE "notifications"
(
  "id"                   VARCHAR2(36) NOT NULL ,
  "subscription_id"      VARCHAR2(36) NULL ,
  "transfer_id"          VARCHAR2(36) NULL ,
  "retry_count"          INTEGER DEFAULT  0  NULL ,
  "retry_at"             TIMESTAMP WITH TIME ZONE
)
/

CREATE INDEX XPKL_NOTIFICATIONS ON "notifications"
  ("id"   ASC)
/

ALTER TABLE "notifications"
  ADD CONSTRAINT  PK_NOTIFICATIONS PRIMARY KEY ("id")
/

CREATE INDEX XIE2NOTIFICATIONS_RETRY_DATETI ON "notifications"
  ("retry_at"   ASC)
/

CREATE INDEX XIF1L_NOTIFICATIONS ON "notifications"
  ("subscription_id"   ASC)
/

CREATE INDEX XIF2L_NOTIFICATIONS ON "notifications"
  ("transfer_id"   ASC)
/

CREATE OR REPLACE TRIGGER trg_ACCOUNTS_SEQ
  BEFORE INSERT
  ON "accounts"
  FOR EACH ROW
  WHEN (new."id" is null)
DECLARE
  v_id "accounts"."id"%TYPE;
BEGIN
  SELECT seq_l_account_pk.nextval INTO v_id FROM DUAL;
  :new."id" := v_id;
END trg_ACCOUNTS_SEQ;
/

CREATE OR REPLACE TRIGGER trg_L_ENTRIES_SEQ
  BEFORE INSERT
  ON "entries"
  FOR EACH ROW
  WHEN (new."id" is null)
DECLARE
  v_id "entries"."id"%TYPE;
BEGIN
  SELECT seq_l_entries_pk.nextval INTO v_id FROM DUAL;
  :new."id" := v_id;
END trg_L_ENTRIES_SEQ;
/

CREATE OR REPLACE TRIGGER trg_L_FULFILLMENTS_SEQ
  BEFORE INSERT
  ON "fulfillments"
  FOR EACH ROW
  WHEN (new."id" is null)
DECLARE
  v_id "fulfillments"."id"%TYPE;
BEGIN
  SELECT seq_l_fulfillments_pk.nextval INTO v_id FROM DUAL;
  :new."id" := v_id;
END trg_L_FULFILLMENTS_SEQ;
/


CREATE OR REPLACE TRIGGER trg_L_ENTRIES_ins
BEFORE INSERT
   ON  "entries"
   FOR EACH ROW
BEGIN
   :new."created_at" := sysdate;
END;
/

exit
