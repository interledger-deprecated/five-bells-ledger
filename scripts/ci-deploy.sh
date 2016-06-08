#!/bin/bash -ex

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

publishNpm
pushDocker
updateWebsite
