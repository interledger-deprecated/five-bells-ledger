--WHENEVER SQLERROR EXIT SQL.SQLCODE

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_TRANSFER_ADJUSTMENTS')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_ACCOUNTS')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_FULFILLMENTS')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_ENTRIES')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_NOTIFICATIONS')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_SUBSCRIPTIONS')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_TRANSFERS')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_LU_REJECTION_REASON')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

DECLARE
  c_action CONSTANT VARCHAR2(10) := 'ENABLE';
BEGIN
  FOR reg IN (SELECT uc.table_name,
                     uc.constraint_name
                FROM user_constraints uc
               WHERE uc.table_name IN ('L_LU_TRANSFER_STATUS')) LOOP
     EXECUTE IMMEDIATE 'ALTER TABLE ' || reg.table_name || ' ' || c_action ||
                       ' CONSTRAINT ' || reg.constraint_name;
  END LOOP;
END;
/

exit
