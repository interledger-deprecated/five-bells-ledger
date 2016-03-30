#!/bin/bash -ex

uploadCoverage() {
  # On parallel builds, only run coverage command on the container that ran the
  # SQLite tests with coverage
  if [ -d coverage ]; then
    # Extract test results
    cp coverage/xunit.xml "${CIRCLE_TEST_REPORTS}/"

    # Upload coverage data
    docker run --volumes-from ledger-test-sqlite \
      -e COVERALLS_REPO_TOKEN="${COVERALLS_REPO_TOKEN}" \
      interledger/five-bells-ledger npm run coveralls
  fi
}

npmPublish() {
  # Push NPM package if not yet published
  mv npmrc-env .npmrc
  if [ -z "$(npm info $(npm ls --depth=-1 2>/dev/null | head -1 | cut -f 1 -d " ") 2>/dev/null)" ]; then
    npm publish
  fi
}

dockerPush() {
  # Push Docker image tagged latest and tagged with commit descriptor
  sed "s/<AUTH>/${DOCKER_TOKEN}/" < "dockercfg-template" > ~/.dockercfg
  docker tag interledger/five-bells-ledger:latest interledger/five-bells-ledger:"$(git describe)"
  docker push interledger/five-bells-ledger:latest
  docker push interledger/five-bells-ledger:"$(git describe)"
}

uploadCoverage
npmPublish
dockerPush

