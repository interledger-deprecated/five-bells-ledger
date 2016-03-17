# Five Bells Ledger [![npm][npm-image]][npm-url] [![circle][circle-image]][circle-url] [![coveralls][coveralls-image]][coveralls-url]

[npm-image]: https://img.shields.io/npm/v/five-bells-ledger.svg?style=flat
[npm-url]: https://npmjs.org/package/five-bells-ledger
[circle-image]: https://circleci.com/gh/interledger/five-bells-ledger.svg?style=shield&circle-token=e31b3ba89c015bf7f1c6de9f5156e7daa32fd793
[circle-url]: https://circleci.com/gh/interledger/five-bells-ledger
[coveralls-image]: https://coveralls.io/repos/interledger/five-bells-ledger/badge.svg?branch=master&t=oMxPKt
[coveralls-url]: https://coveralls.io/r/interledger/five-bells-ledger?branch=master

> A reference implementation of the Five Bells Ledger API

## Usage

You can see the ledger in action as part of the [`five-bells-demo`](https://github.com/interledger/five-bells-demo)!

To run the ledger as a standalone server:

### Step 1: Clone repo

``` sh
git clone https://github.com/interledger/five-bells-ledger.git
cd five-bells-ledger
```

### Step 2: Install dependencies

``` sh
npm install
```

### Step 3: Run it!

To run it using an in-memory database (the simplest option), run:

``` sh
LEDGER_DB_SYNC=1 LEDGER_DB_URI=sqlite://:memory: npm start
```

Or run:

```sh
npm start
```

With the following configuration options set as environment variables:

* `LEDGER_DB_URI` (required; e.g.: `mysql://root:password@localhost/fivebells`) URI for connecting to a database. Defaults to `sqlite` if no database is set.
* `LEDGER_PORT` (default: `3000`) Port that Five Bells Ledger will listen on.
* `LEDGER_BIND_IP` (default: `0.0.0.0`) IP that Five Bells Ledger will bind to.
* `LEDGER_HOSTNAME` (default: *[your hostname]*) Publicly visible hostname. This is important for things like generating globally unique IDs. Make sure this is a hostname that all your clients will be able to see. The default should be fine for local testing.
* `LEDGER_PUBLIC_PORT` (default: `$PORT`) Publicly visible port. You can set this if your public port differs from the listening port, e.g. because the ledger is running behind a proxy.
* `LEDGER_PUBLIC_HTTPS` (default: `''`) Whether or not the publicly visible instance of Five Bells Ledger is using HTTPS.
* `LEDGER_ADMIN_USER` (default: `'admin'`) The admin account's username (an admin user can create/modify accounts).
* `LEDGER_ADMIN_PASS` (default: none) The admin account's password.
* `LEDGER_ADMIN_FINGERPRINT` (default: none) The admin account's TLS certificate fingerprint if using TLS Client Certificate Auth.
* `LEDGER_UNIT_DB_URI` (default `'sqlite://'`) Database to use for running unit tests. Configured separately for safety.
* `LEDGER_AUTH_BASIC_ENABLED` (default `1`) whether or not to allow HTTP basic authentication.
* `LEDGER_AUTH_HTTP_SIGNATURE_ENABLED` (default `1`) whether or not to allow HTTP signature authentication.
* `LEDGER_AUTH_CLIENT_CERT_ENABLED` (default `0`) whether or not to allow TLS Client Certificate authentication (requires HTTPS).
* `LEDGER_USE_HTTPS` (default `0`) whether or not to run the server using HTTPS.
* `LEDGER_TLS_KEY` (default: none) the path to the server private key file. Required if using HTTPS.
* `LEDGER_TLS_CERTIFICATE` (default: none) the path to the server certificate file. Required if using HTTPS.
* `LEDGER_TLS_CRL` (default: none) the path to the server certificate revokation list file. Optional if using HTTPS.
* `LEDGER_TLS_CA` (default: none) the path to a trusted certificate to be used in addition to using the [default list](https://github.com/nodejs/node/blob/v4.3.0/src/node_root_certs.h). Optional if using HTTPS.
* `LEDGER_FEATURE_CREDIT_AUTH` (default: `0`) whether or not to require credits to be authorized.
* `LEDGER_CURRENCY_CODE` (default: none) ISO 4217 currency code
* `LEDGER_CURRENCY_SYMBOL` (default: none) currency symbol


## Running with Docker (Alternative Method)

This project can be run in a [Docker](https://www.docker.com/) container.

You need a local database instance listening on port 8080. Here is how to set that up:

``` sh
docker run --name mysql -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 -d mysql
export LEDGER_DB_URI=mysql://root:password@localhost/fivebells
npm run migrate
```

Then run the following (with the same environment variables) as described above:

``` sh
docker run -it --rm --net=host -e LEDGER_PORT=1337 -e LEDGER_DB_URI=$LEDGER_DB_URI interleder/five-bells-ledger
```

Breaking down that command:

* `-it` Run Five Bells Ledger in an interactive terminal.
* `--rm` Delete container when it's done running.
* `--net=host` Don't isolate container into its own virtual network. This allows Five Bells Ledger to see the database that we set up above.
* `-e LEDGER_PORT=1337` Set the ledger's port to 1337. This is just an example for how to set a config option.
