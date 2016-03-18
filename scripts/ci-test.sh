#!/bin/bash -ex

NODE_INDEX="$1"
TOTAL_NODES="$2"

lint() {
  npm run lint
}

integrationtest() {
  npm run integration
}

apidoc() {
  npm run apidoc
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
  aws s3 cp s3://ilp-server-ci-files/instantclient-sdk-linux.x64-12.1.0.2.0.zip .
  aws s3 cp s3://ilp-server-ci-files/instantclient-basic-linux.x64-12.1.0.2.0.zip .
  unzip instantclient-sdk-linux.x64-12.1.0.2.0.zip
  unzip instantclient-basic-linux.x64-12.1.0.2.0.zip
  # Need symlinks from .so.12.1 to .so
  ln -s libocci.so.12.1 instantclient_12_1/libocci.so
  ln -s libclntsh.so.12.1 instantclient_12_1/libclntsh.so
  sudo mkdir -p /opt/oracle
  sudo cp -r instantclient_12_1 /opt/oracle/instantclient
  npm i strong-oracle
  # Check for node_modules/strong-oracle explicitly because even if installation of it fails, npm doesn't catch it.
  if [[ ! -d node_modules/strong-oracle ]] ; then echo 'node_modules/strong-oracle is not there, return error.' ; exit 1 ; fi
  # Build container
  docker build -t interledger/five-bells-ledger .
  npm run test-oracle-ci
}

oneNode() {
  lint
  sqlitetestest
  integrationtest
  mysqltest
  postgrestest
  oracletest
  apidoc
}

twoNodes() {
  case "$NODE_INDEX" in
    0) lint; sqlitetest integrationtest; mysqltest;;
    1) oracletest; postgrestest apidoc;;
    *) echo "ERROR: invalid usage"; exit 2;;
  esac
}

threeNodes() {
  case "$NODE_INDEX" in
    0) lint; sqlitetest integrationtest;;
    1) postgrestest; mysqltest;;
    2) oracletest; apidoc;;
    *) echo "ERROR: invalid usage"; exit 2;;
  esac
}

fourNodes() {
  case "$NODE_INDEX" in
    0) sqlitetest; integrationtest;;
    1) apidoc; postgrestest;;
    2) lint; mysqltest;;
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
