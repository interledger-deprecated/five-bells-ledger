#!/bin/bash -ex

NODE_INDEX="$1"
TOTAL_NODES="$2"
ORACLE_DIR="$HOME/.oracle"

lint() {
  npm run lint
}

integrationtest() {
  npm run integration
}

apidoc() {
  npm run apidoc
}

dockerBuild() {
  docker build -t interledger/five-bells-ledger .
}

mysqltest() {
  mysql -u ubuntu -e 'DROP DATABASE circle_test;'
  mysql -u ubuntu -e 'CREATE DATABASE circle_test;'
  docker run --name=ledger-test-mysql -it --net=host -e LEDGER_UNIT_DB_URI=mysql://ubuntu@localhost/circle_test interledger/five-bells-ledger npm test
}

postgrestest() {
  psql -U ubuntu -c 'DROP DATABASE circle_test;'
  psql -U ubuntu -c 'CREATE DATABASE circle_test;'
  docker run --name=ledger-test-postgres -it --net=host -e LEDGER_UNIT_DB_URI=postgres://ubuntu@localhost/circle_test interledger/five-bells-ledger npm test
}

sqlitetest() {
  # Run tests with coverage (SQLite)
  mkdir coverage
  docker run --name=ledger-test-sqlite -it --net=host -e LEDGER_UNIT_DB_URI=sqlite:// -e XUNIT_FILE=coverage/xunit.xml -v "$PWD"/coverage:/usr/src/app/coverage interledger/five-bells-ledger sh -c 'npm test --coverage -- -R spec-xunit-file'
  # Extract test results
  cp coverage/xunit.xml "${CIRCLE_TEST_REPORTS}/"
}

oracletest() {
  # Install Oracle
  docker pull wnameless/oracle-xe-11g
  docker run -d -p 49160:22 -p 49161:1521 wnameless/oracle-xe-11g
  # Download and unzip Oracle library
  mkdir -p "$ORACLE_DIR"

  local clientSDK="instantclient-sdk-linux.x64-12.1.0.2.0.zip"
  if [ ! -f "$ORACLE_DIR/$clientSDK" ]; then
    (
    cd "$ORACLE_DIR" || exit 1

    aws s3 cp s3://ilp-server-ci-files/"$clientSDK" .
    aws s3 cp s3://ilp-server-ci-files/instantclient-basic-linux.x64-12.1.0.2.0.zip .
    unzip $clientSDK
    unzip instantclient-basic-linux.x64-12.1.0.2.0.zip
    # Need symlinks from .so.12.1 to .so
    ln -s libocci.so.12.1 instantclient_12_1/libocci.so
    ln -s libclntsh.so.12.1 instantclient_12_1/libclntsh.so
    sudo mkdir -p /opt/oracle
    sudo cp -r instantclient_12_1 /opt/oracle/instantclient

    cd -
    )
  fi

  npm i strong-oracle
  # Check for node_modules/strong-oracle explicitly because even if installation of it fails, npm doesn't catch it.
  if [[ ! -d node_modules/strong-oracle ]] ; then echo 'node_modules/strong-oracle is not there, return error.' ; exit 1 ; fi
  # Build container
  LEDGER_UNIT_DB_URI='oracle://system:oracle@localhost:49161/' LD_LIBRARY_PATH=/opt/oracle/instantclient node node_modules/.bin/istanbul test -- _mocha
}

oneNode() {
  lint
  dockerBuild
  sqlitetestest
  integrationtest
  mysqltest
  postgrestest
  oracletest
  apidoc
}

twoNodes() {
  case "$NODE_INDEX" in
    0) lint; dockerBuild; sqlitetest integrationtest; mysqltest;;
    1) dockerBuild; oracletest; postgrestest; apidoc;;
    *) echo "ERROR: invalid usage"; exit 2;;
  esac
}

threeNodes() {
  case "$NODE_INDEX" in
    0) lint; dockerBuild; sqlitetest integrationtest;;
    1) dockerBuild; postgrestest; mysqltest;;
    2) oracletest; apidoc;;
    *) echo "ERROR: invalid usage"; exit 2;;
  esac
}

fourNodes() {
  case "$NODE_INDEX" in
    0) dockerBuild; sqlitetest; postgrestest;;
    1) integrationtest;;
    2) lint; dockerBuild; mysqltest; apidoc;;
    3) oracletest;;
    *) echo "ERROR: invalid usage"; exit 2;;
  esac
}

case "$TOTAL_NODES" in
  "") oneNode;;
  1) oneNode;;
  2) twoNodes;;
  3) threeNodes;;
  4) fourNodes;;
  *) echo "ERROR: invalid usage"; exit 2;;
esac
