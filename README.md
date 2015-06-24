# Five Bells Ledger [![Circle CI](https://circleci.com/gh/ripple/five-bells-ledger/tree/master.svg?style=svg&circle-token=e31b3ba89c015bf7f1c6de9f5156e7daa32fd793)](https://circleci.com/gh/ripple/five-bells-ledger/tree/master) [![Docker Repository on Quay.io](https://quay.io/repository/ripple/five-bells-ledger/status?token=5d3a0893-14d4-4392-8a86-9fcc484c43c3 "Docker Repository on Quay.io")](https://quay.io/repository/ripple/five-bells-ledger)

> A reference implementation of the Five Bells Ledger API

## Usage (Docker)

Note: You need a local [CockroachDB](https://github.com/cockroachdb/cockroach) instance listening on port 8080. Here is how to set that up:

``` sh
docker pull cockroachdb/cockroach:alpha-3156-ge7385d9
docker run -p 8080:8080 -v /data cockroachdb/cockroach:alpha-3156-ge7385d9 init --stores=ssd=/data
docker run -p 8080:8080 -d --volumes-from=$(docker ps -q -n 1) cockroachdb/cockroach:alpha-3156-ge7385d9 start --stores=ssd=/data --gossip=self:// --insecure
```

Afterwards just run Five Bells Ledger:

``` sh
docker run quay.io/ripple/five-bells-ledger
```
