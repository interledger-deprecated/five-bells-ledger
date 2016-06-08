#!/bin/bash -ex

uploadCoverage() {
  # On parallel builds, only run coverage command on the container that ran the
  # SQLite tests with coverage
  if [ -d coverage ]; then
    # Extract test results
    cp coverage/xunit.xml "${CIRCLE_TEST_REPORTS}/"

    # Upload coverage data
    docker run --volumes-from ledger-test-sqlite \
      -e CODECOV_TOKEN="${CODECOV_TOKEN}" \
      -e CIRCLECI="${CIRCLECI}" \
      -e CIRCLE_BUILD_NUM="${CIRCLE_BUILD_NUM}" \
      -e CIRCLE_NODE_INDEX="${CIRCLE_NODE_INDEX}" \
      -e CIRCLE_SHA1="${CIRCLE_SHA1}" \
      -e CIRCLE_BRANCH="${CIRCLE_BRANCH}" \
      -e CIRCLE_PR_NUMBER="${CIRCLE_PR_NUMBER}" \
      -e CIRCLE_PROJECT_USERNAME="${CIRCLE_PROJECT_USERNAME}" \
      -e CIRCLE_PROJECT_REPONAME="${CIRCLE_PROJECT_REPONAME}" \
      interledger/five-bells-ledger npm run report-coverage
  fi
}

publishNpm() {
  # Push NPM package if not yet published
  mv npmrc-env .npmrc
  if [ -z "$(npm info $(npm ls --depth=-1 2>/dev/null | head -1 | cut -f 1 -d " ") 2>/dev/null)" ]; then
    npm publish
  fi
}

pushDocker() {
  # Push Docker image tagged latest and tagged with commit descriptor
  sed "s/<AUTH>/${DOCKER_TOKEN}/" < "dockercfg-template" > ~/.dockercfg
  docker tag interledger/five-bells-ledger:latest interledger/five-bells-ledger:"$(git describe)"
  docker push interledger/five-bells-ledger:latest
  docker push interledger/five-bells-ledger:"$(git describe)"
}

updateWebsite() {
  node scripts/publish_web.js
}

uploadCoverage
publishNpm
pushDocker
updateWebsite
