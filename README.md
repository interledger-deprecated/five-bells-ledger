# Five Bells Ledger [![npm][npm-image]][npm-url] [![circle][circle-image]][circle-url] [![codecov][codecov-image]][codecov-url] [![Known Vulnerabilities][snyk-image]][snyk-url] 
 
[npm-image]: https://img.shields.io/npm/v/five-bells-ledger.svg?style=flat
[npm-url]: https://npmjs.org/package/five-bells-ledger
[circle-image]: https://circleci.com/gh/interledgerjs/five-bells-ledger.svg?style=shield&circle-token=e31b3ba89c015bf7f1c6de9f5156e7daa32fd793
[circle-url]: https://circleci.com/gh/interledgerjs/five-bells-ledger
[codecov-image]: https://codecov.io/gh/interledgerjs/five-bells-ledger/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/interledgerjs/five-bells-ledger
[snyk-image]: https://snyk.io/test/github/interledgerjs/five-bells-ledger/badge.svg
[snyk-url]: https://snyk.io/test/github/interledgerjs/five-bells-ledger

> A reference implementation of the Five Bells Ledger API


## Usage

You can see the ledger in action as part of the [`five-bells-demo`](https://github.com/interledgerjs/five-bells-demo)!

To run the ledger as a standalone server:

### Step 1: Clone repo

``` sh
git clone https://github.com/interledgerjs/five-bells-ledger.git
cd five-bells-ledger
```

### Step 2: Install dependencies

``` sh
npm install
```

### Step 3: Run it!

To run it using an in-memory database (the simplest option), run:

``` sh
LEDGER_ADMIN_PASS=mypassword LEDGER_DB_URI=sqlite://:memory: npm start
```

Or run:

```sh
npm start
```

See "Environment Variables" in the generated documentation for config options.

## Building Docs

After installation:

```sh
npm run docs
```

Open `apidocs-out/index.html` in a web browser to see the generated API documentation.

## Running with Docker (Alternative Method)

This project can be run in a [Docker](https://www.docker.com/) container.

You need to start a postgres container:

``` sh
docker run --name five-bells-ledger-db -e POSTGRES_PASSWORD=password -d postgres
```

After giving postgres a few seconds to start up, you can run a five-bells-ledger Docker container, linking to that database:

``` sh
docker run -d -e LEDGER_PORT=1337 -e LEDGER_ADMIN_PASS=admin -e LEDGER_DB_URI=postgres://postgres:password@db --link five-bells-ledger-db:db -p 1337:1337 -h localhost --name fivebells interledger/five-bells-ledger
```

Breaking down that command:

* `-d` Run in the background
* `-e LEDGER_PORT=1337` Set the ledger's port to 1337. This is just an example for how to set a config option.
* `-e LEDGER_ADMIN_PASS=admin` Create an "admin" user with password "admin" at startup
* `-e LEDGER_DB_URI=postgres://postgres:password@db` Set the database URL. Here, 'db' is a host that is Docker-linked:
* `--link five-bells-ledger-db:db` This allows Five Bells Ledger to see the database that we set up above.
* `-p 1337:1337` Expose port 1337 to localhost
* `-h localhost` makes the ledger use 'localhost' as its hostname in the endpoint URLs it announces
* `--name fivebells` This allows you to refer to this container in for instance `docker inspect fivebells`
* `interledger/five-bells-ledger` Use the [`five-bells-ledger` Docker image](https://hub.docker.com/r/interledger/five-bells-ledger/)

Now open http://localhost:1337/health in your browser.

To create a user, you can run:

```sh
curl -i -sS -X PUT --user admin:admin -H "Content-Type: application/json" -d'{ "name" : "alice", "password" : "alice", "balance" : "20000" }' http://localhost:1337/accounts/alice
```

To see the database contents, you can create a postgres container that interactively runs psql:
```sh
docker run -it --rm --link five-bells-ledger-db:db postgres psql postgres://postgres:password@db
```

You can then use [`ilp-plugin-bells`](https://github.com/interledgerjs/ilp-plugin-bells) to develop a client that connects to this ledger. Make sure you use the matching plugin version to connect to the ledger.

In particular, ledger version 20 can be accessed using `ilp-plugin-bells` version 12.

## Running tests

To run tests using an in-memory database, run:

``` sh
npm test
```

By default, stdout from the app process is buffered up, and only shown after a test fails. That way, you can easily debug a failing test:

```sh
DEBUG=ledger:* npm test
```

If you want to see the output for passing tests as well, and not buffered until the test is over, use the `SHOW_STDOUT` environment variable for this:

```sh
SHOW_STDOUT=true DEBUG=ledger:transfers npm test
```

If you wish to specify the database against which the tests are run, use the `LEDGER_UNIT_DB_URI` environment variable.

``` sh
LEDGER_UNIT_DB_URI=postgres://root:password@localhost:5432/ledger_test_db npm test
```

For example, to run against a Postgres instance in Docker, first start the database server:

``` sh
docker run -it --rm --name fbl-pg-test postgres
```

Then, in another terminal, run the tests:

``` sh
LEDGER_UNIT_DB_URI=postgres://postgres@`docker inspect --format '{{ .NetworkSettings.IPAddress }}' fbl-pg-test`/postgres npm test
```

## A word of warning

This software is under development and no guarantees are made regarding reliability.
