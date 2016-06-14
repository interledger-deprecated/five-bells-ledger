BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "L_ACCOUNTS"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "L_SUBSCRIPTIONS"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "L_ENTRIES"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "L_TRANSFERS"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "L_FULFILLMENTS"';
EXCEPTION
   WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
         RAISE;
      END IF;
END;
/

BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE "L_NOTIFICATIONS"';
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

CREATE TABLE "L_ACCOUNTS"
(
  "ACCOUNT_ID"           INTEGER  NOT NULL ,
  "NAME"                 VARCHAR2(255) NOT NULL ,
  "BALANCE"              NUMBER(32,16) NULL ,
  "CONNECTOR"            VARCHAR2(1024) NULL ,
  "PASSWORD_HASH"        VARCHAR2(1024) NULL ,
  "PUBLIC_KEY"           VARCHAR2(4000) NULL ,
  "IS_ADMIN"             SMALLINT NULL ,
  "IS_DISABLED"          SMALLINT NULL ,
  "FINGERPRINT"          VARCHAR2(255) ,
  "MINIMUM_ALLOWED_BALANCE" NUMBER(32,16) DEFAULT  0  NULL,
  CONSTRAINT "MIN_BALANCE_CONSTRAINT" CHECK ("BALANCE" >= "MINIMUM_ALLOWED_BALANCE")
)
/

CREATE INDEX XPKACCOUNTS ON "L_ACCOUNTS"
  ("ACCOUNT_ID"   ASC)
/

ALTER TABLE "L_ACCOUNTS"
  ADD CONSTRAINT  PK_ACCOUNTS PRIMARY KEY ("ACCOUNT_ID")
/

CREATE UNIQUE INDEX XAK1ACCOUNTS ON "L_ACCOUNTS"
  ("NAME"   ASC)
/

ALTER TABLE "L_ACCOUNTS"
  ADD CONSTRAINT  XAK1_ACCOUNTS UNIQUE ("NAME")
/

CREATE INDEX XIE1_FINGERPRINTS ON "L_ACCOUNTS"
  ("FINGERPRINT"   ASC)
/

CREATE TABLE "L_SUBSCRIPTIONS"
(
  "SUBSCRIPTION_ID"      VARCHAR2(64) NOT NULL ,
  "OWNER"                VARCHAR2(1024) NULL ,
  "EVENT"                VARCHAR2(255)  DEFAULT  NULL  NULL ,
  "SUBJECT"              VARCHAR2(1024) NULL ,
  "TARGET"               VARCHAR2(1024) DEFAULT  NULL  NULL ,
  "IS_DELETED"           SMALLINT DEFAULT 0 NOT NULL
)
/

CREATE INDEX XPKL_SUBSCRIPTIONS ON "L_SUBSCRIPTIONS"
  ("SUBSCRIPTION_ID" ASC)
/

ALTER TABLE "L_SUBSCRIPTIONS"
  ADD CONSTRAINT  PK_SUBSCRIPTIONS PRIMARY KEY ("SUBSCRIPTION_ID")
/

CREATE INDEX XIE1L_SUBSCRIPTIONS ON "L_SUBSCRIPTIONS"
  ("IS_DELETED" ASC)
/

CREATE TABLE "L_TRANSFERS"
(
  "TRANSFER_ID"          VARCHAR2(36)  NOT NULL ,
  "LEDGER"               VARCHAR2(1024) NULL ,
  "DEBITS"               VARCHAR2(4000) NULL ,
  "CREDITS"              VARCHAR2(4000) NULL ,
  "STATE"                VARCHAR2(4000) NULL ,
  "REJECTION_REASON"     VARCHAR2(4000) NULL ,
  "ADDITIONAL_INFO"      VARCHAR2(4000) NULL ,
  "EXECUTION_CONDITION"  VARCHAR2(4000) NULL ,
  "CANCELLATION_CONDITION" VARCHAR2(4000) NULL ,
  "EXPIRES_AT"         TIMESTAMP NULL ,
  "PROPOSED_AT"        TIMESTAMP NULL ,
  "PREPARED_AT"        TIMESTAMP NULL ,
  "EXECUTED_AT"        TIMESTAMP NULL ,
  "REJECTED_AT"        TIMESTAMP NULL
)
/

CREATE INDEX XPKL_TRANSFERS ON "L_TRANSFERS"
  ("TRANSFER_ID"   ASC)
/

ALTER TABLE "L_TRANSFERS"
  ADD CONSTRAINT  PK_TRANSFERS PRIMARY KEY ("TRANSFER_ID")
/

CREATE TABLE "L_ENTRIES"
(
  "ENTRY_ID"             INTEGER  NOT NULL ,
  "TRANSFER_ID"          VARCHAR2(64) NULL ,
  "ACCOUNT"              INTEGER NULL ,
  "CREATED_AT"           TIMESTAMP NOT NULL
)
/

CREATE INDEX XPKL_ENTRIES ON "L_ENTRIES"
  ("ENTRY_ID"   ASC)
/

ALTER TABLE "L_ENTRIES"
  ADD CONSTRAINT  PK_ENTRIES PRIMARY KEY ("ENTRY_ID")
/

CREATE INDEX XAK1L_ENTRIES ON "L_ENTRIES"
  ("TRANSFER_ID"   ASC, "ACCOUNT"   ASC)
/

CREATE INDEX XIF2L_ENTRIES ON "L_ENTRIES"
  ("ACCOUNT"   ASC)
/

CREATE INDEX XIF3L_ENTRIES ON "L_ENTRIES"
  ("TRANSFER_ID"   ASC)
/

CREATE INDEX XIE1L_ENTRIES ON "L_ENTRIES"
  ("CREATED_AT"   ASC)
/

CREATE TABLE "L_FULFILLMENTS"
(
  "FULFILLMENT_ID"        INTEGER NOT NULL ,
  "TRANSFER_ID"           VARCHAR2(64) NULL ,
  "CONDITION_FULFILLMENT" VARCHAR2(4000) NULL
)
/

CREATE INDEX XPKL_FULFILLMENTS ON "L_FULFILLMENTS"
  ("FULFILLMENT_ID"   ASC)
/

ALTER TABLE "L_FULFILLMENTS"
  ADD CONSTRAINT  PK_FULFILLMENTS PRIMARY KEY ("FULFILLMENT_ID")
/

CREATE INDEX XIF1L_FULFILLMENTS ON "L_FULFILLMENTS"
  ("TRANSFER_ID"   ASC)
/

CREATE TABLE "L_NOTIFICATIONS"
(
  "NOTIFICATION_ID"      VARCHAR2(36) NOT NULL ,
  "SUBSCRIPTION_ID"      VARCHAR2(36) NULL ,
  "TRANSFER_ID"          VARCHAR2(36) NULL ,
  "RETRY_COUNT"          INTEGER DEFAULT  0  NULL ,
  "RETRY_AT"             TIMESTAMP WITH TIME ZONE
)
/

CREATE INDEX XPKL_NOTIFICATIONS ON "L_NOTIFICATIONS"
  ("NOTIFICATION_ID"   ASC)
/

ALTER TABLE "L_NOTIFICATIONS"
  ADD CONSTRAINT  PK_NOTIFICATIONS PRIMARY KEY ("NOTIFICATION_ID")
/

CREATE INDEX XIE2NOTIFICATIONS_RETRY_DATETI ON "L_NOTIFICATIONS"
  ("RETRY_AT"   ASC)
/

CREATE INDEX XIF1L_NOTIFICATIONS ON "L_NOTIFICATIONS"
  ("SUBSCRIPTION_ID"   ASC)
/

CREATE INDEX XIF2L_NOTIFICATIONS ON "L_NOTIFICATIONS"
  ("TRANSFER_ID"   ASC)
/

CREATE OR REPLACE TRIGGER trg_ACCOUNTS_SEQ
  BEFORE INSERT
  ON "L_ACCOUNTS"
  FOR EACH ROW
  WHEN (new."ACCOUNT_ID" is null)
DECLARE
  v_id "L_ACCOUNTS"."ACCOUNT_ID"%TYPE;
BEGIN
  SELECT seq_l_account_pk.nextval INTO v_id FROM DUAL;
  :new."ACCOUNT_ID" := v_id;
END trg_ACCOUNTS_SEQ;
/

CREATE OR REPLACE TRIGGER trg_L_ENTRIES_SEQ
  BEFORE INSERT
  ON "L_ENTRIES"
  FOR EACH ROW
  WHEN (new."ENTYR_ID" is null)
DECLARE
  v_id "L_ENTRIES"."ENTRY_ID"%TYPE;
BEGIN
  SELECT seq_l_entries_pk.nextval INTO v_id FROM DUAL;
  :new."ENTRY_ID" := v_id;
END trg_L_ENTRIES_SEQ;
/

CREATE OR REPLACE TRIGGER trg_L_FULFILLMENTS_SEQ
  BEFORE INSERT
  ON "L_FULFILLMENTS"
  FOR EACH ROW
  WHEN (new."FULFILLMENT_ID" is null)
DECLARE
  v_id "L_FULFILLMENTS"."FULFILLMENT_ID"%TYPE;
BEGIN
  SELECT seq_l_fulfillments_pk.nextval INTO v_id FROM DUAL;
  :new."FULFILLMENT_ID" := v_id;
END trg_L_FULFILLMENTS_SEQ;
/


CREATE OR REPLACE TRIGGER trg_L_ENTRIES_ins
BEFORE INSERT
   ON  "L_ENTRIES"
   FOR EACH ROW
BEGIN
   :new."CREATED_AT" := sysdate;
END;
/

exit