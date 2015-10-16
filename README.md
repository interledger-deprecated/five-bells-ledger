# Five Bells Ledger [![Circle CI](https://circleci.com/gh/ripple/five-bells-ledger/tree/master.svg?style=svg&circle-token=e31b3ba89c015bf7f1c6de9f5156e7daa32fd793)](https://circleci.com/gh/ripple/five-bells-ledger/tree/master) [![Docker Repository on Quay.io](https://quay.io/repository/ripple/five-bells-ledger/status?token=5d3a0893-14d4-4392-8a86-9fcc484c43c3 "Docker Repository on Quay.io")](https://quay.io/repository/ripple/five-bells-ledger) [![Coverage Status](https://coveralls.io/repos/ripple/five-bells-ledger/badge.svg?branch=master&t=oMxPKt)](https://coveralls.io/r/ripple/five-bells-ledger?branch=master)

> A reference implementation of the Five Bells Ledger API

## Usage (Docker)

Note: You need a local database instance listening on port 8080. Here is how to set that up:

``` sh
docker run --name mysql -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 -d mysql
export DB_URI=mysql://root:password@localhost/fivebells
npm run migrate
```

Afterwards just run Five Bells Ledger:

``` sh
docker run -it --rm --net=host -e PORT=1337 -e DB_URI=$DB_URI quay.io/ripple/five-bells-ledger
```

Breaking down that command:

* `-it` Run Five Bells Ledger in an interactive terminal.
* `--rm` Delete container when it's done running.
* `--net=host` Don't isolate container into its own virtual network. This allows Five Bells Ledger to see the database that we set up above.
* `-e PORT=1337` Set the ledger's port to 1337. This is just an example for how to set a config option.

Configuration options:

* `LEDGER_BIND_IP` (default: `0.0.0.0`) IP that Five Bells Ledger will bind to.
* `LEDGER_PORT` (default: `3000`) Port that Five Bells Ledger will listen on.
* `LEDGER_HOSTNAME` (default: *[your hostname]*) Publicly visible hostname. This is important for things like generating globally unique IDs. Make sure this is a hostname that all your clients will be able to see. The default should be fine for local testing.
* `LEDGER_PUBLIC_PORT` (default: `$PORT`) Publicly visible port. You can set this if your public port differs from the listening port, e.g. because the ledger is running behind a proxy.
* `LEDGER_PUBLIC_HTTPS` (default: `''`) Whether or not the publicly visible instance of Five Bells Ledger is using HTTPS.
* `LEDGER_DB_URI` (required; e.g.: `mysql://root:password@localhost/fivebells`) URI for connecting to a database.
