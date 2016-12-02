#!/bin/bash -ex

NODE_INDEX="$1"
TOTAL_NODES="$2"

lint() {
  npm run lint
}

integrationtest() {
  if git log -1 --pretty=%B | grep -qF "[skip tests]"; then true; else npm run integration; fi
}

docs() {
  npm run docs
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
  LEDGER_UNIT_DB_URI=postgres://ubuntu@localhost/circle_test npm test
}

sqlitetest() {
  # Run tests with coverage (SQLite)
  mkdir coverage
  LEDGER_UNIT_DB_URI=sqlite:// XUNIT_FILE=coverage/xunit.xml npm test --coverage -- -R spec-xunit-file

  # Extract test results
  cp coverage/xunit.xml "${CIRCLE_TEST_REPORTS}/"

  # Report coverage
  npm run report-coverage
}

oneNode() {
  lint
  dockerBuild
  sqlitetestest
  integrationtest
  postgrestest
  docs
}

twoNodes() {
  case "$NODE_INDEX" in
    0) lint; dockerBuild; sqlitetest; integrationtest;;
    1) dockerBuild; postgrestest; docs;;
    *) echo "ERROR: invalid usage"; exit 2;;
  esac
}

threeNodes() {
  case "$NODE_INDEX" in
    0) lint; dockerBuild; sqlitetest integrationtest;;
    1) dockerBuild; postgrestest;;
    2) docs;;
    *) echo "ERROR: invalid usage"; exit 2;;
  esac
}

fourNodes() {
  case "$NODE_INDEX" in
    0) integrationtest;;
    1) dockerBuild; sqlitetest; postgrestest;;
    2) lint; dockerBuild;;
    3) docs;;
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
