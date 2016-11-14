<!-- this intro sourced from scripts/apidoc_intro.md.ejs: changes to the .md file directly will be lost! -->

Five Bells Ledger is a JavaScript reference implementation of an ILP-compatible ledger with a RESTful API. It demonstrates one possible way that a ledger could expose conditional transfers to be used as part of the Interledger Protocol. It also has some basic functionality that any ledger might have.

### Contents

* Data Structures:
    * [Transfer Object](#transfer_object)
    * [Account Object](#account_object)
    * [Notification Object](#notification_object)
* Other Concepts:
    * [Authentication](#authentication)
    * [Crypto-Conditions](#cryptoconditions)
    * [Environment Variables](#environment_variables)
    * [RPC Error Codes](#rpc_error_codes)



## Transfer Object
<a id='transfer_object'></a>

A transfer is the core action of the Five Bells Ledger. It can have multiple debits and multiple credits. (The sum of all credits must equal the sum of all debits.) It can be conditional upon a supplied crypto-condition, in which case it executes automatically when presented with the fulfillment for the condition. (Assuming the transfer has not expired or been canceled first.) If no crypto-condition is specified, the transfer is unconditional, and executes as soon as it is prepared.

A transfer object can have the following fields:

<!-- This table sourced from the five-bells-shared TransferTemplate.json schema. -->
<%- renderSchema("TransferTemplate.json") %>


## Account Object
<a id='account_object'></a>

An account object represents one balance in the ledger, a means of authentication to access that balance, and some metadata about it.

An account object can have the following fields:

<!-- This table sourced from the five-bells-shared Account.json schema. -->
<%- renderSchema("Account.json") %>


## Notification Object
<a id='notification_object'></a>

The Ledger pushes a notification object to WebSocket clients when a transfer changes state. This notification is sent _at most once_ for each state change. If a transfer advances through multiple steps as part of a single operation, the notification only describes the final state of the transfer. (For example, if an unconditional transfer is proposed, prepared, and executed by one request, there is only a notification that the transfer has reached the "executed" state.)

A notification object can have the following fields:

<!-- This table sourced from the five-bells-shared Notification.json schema. -->
<%- renderSchema("Notification.json") %>


## Crypto-Conditions
<a id='cryptoconditions'></a>

The [Crypto-Conditions spec](https://github.com/interledger/rfcs/tree/master/0002-crypto-conditions) defines standard formats for _conditions_ and _fulfillments_.

Conditions are distributable event descriptions, and fulfillments are cryptographically verifiable messages that prove an event occurred. If you transmit a fulfillment, then everyone who has the corresponding condition can agree that the condition has been met.

In the Five Bells Ledger, we use crypto-conditions to control the execution or cancellation of conditional transfers. The ledger supports conditions and fulfillments in string format.

The Crypto-Conditions specification anticipates that it will need to expand to keep up with changes in the field of cryptography, so conditions always define which rules and algorithms are necessary to verify the fulfillment. Implementations can use the condition's feature list to determine if they can properly process the fulfillment, without having seen the fulfillment itself.

Example condition in string format:

    cc:0:3:dB-8fb14MdO75Brp_Pvh4d7ganckilrRl13RS_UmrXA:66

Example fulfillment in string format:

    cf:0:VGhlIG9ubHkgYmFzaXMgZm9yIGdvb2QgU29jaWV0eSBpcyB1bmxpbWl0ZWQgY3JlZGl0LuKAlE9zY2FyIFdpbGRl


## Authentication
<a id='authentication'></a>

The Five Bells Ledger supports two kinds of authentication: HTTP Basic, or client-side certificates. HTTP Basic auth is good for development, but provides very limited security. Client certificates can be complex to set up, but allow many secure configurations.

### HTTP Basic Auth

[HTTP Basic Auth](https://tools.ietf.org/html/rfc2617) is enabled by default. To authorize a request, specify the `Authorization` header. Your authentication determines which permissions you have:

* No authentication is necessary for some methods, such as [Get Server Metadata](#api-Metadata_Methods-GetMetadata).
* Account-level authentication is necessary for most operations, such as getting account details or preparing transfers. Account credentials are defined by the `name` and `password` fields of the [account object](#account_object).
* Admin-level authentication is necessary for some operations, such as creating new accounts. Admin credentials are defined by [environment variables](#environment_variables) when the server is started. You can also flag an account as admin to give that account's credentials admin powers.


## Environment Variables
<a id='environment_variables'></a>

Use the following environment variables to configure the service when run:

* `LEDGER_DB_URI` (required; e.g.: `mysql://root:password@localhost/fivebells`) URI for connecting to a database. Defaults to `sqlite` if no database is set.
* `LEDGER_PORT` (default: `3000`) Port that Five Bells Ledger will listen on.
* `LEDGER_BIND_IP` (default: `0.0.0.0`) IP that Five Bells Ledger will bind to.
* `LEDGER_PUBLIC_URI` (default: `http://$HOSTNAME:$LEDGER_PORT`) URI prefix where the ledger will be publicly visible. All IDs and URIs that that the ledger outputs will be using this root URI.
* `LEDGER_ILP_PREFIX` (default: none) ILP prefix for accounts on this ledger, included in the ledger's metadata. Used by plugins to set their ILP prefix.
* `LEDGER_ADMIN_USER` (default: `'admin'`) The admin account's username (an admin user can create/modify accounts).
* `LEDGER_ADMIN_PASS` (default: none) The admin account's password.
* `LEDGER_ADMIN_FINGERPRINT` (default: none) The admin account's TLS certificate fingerprint if using TLS Client Certificate Auth.
* `LEDGER_AUTH_BASIC_ENABLED` (default `1`) whether or not to allow HTTP basic authentication.
* `LEDGER_AUTH_HTTP_SIGNATURE_ENABLED` (default `1`) whether or not to allow HTTP signature authentication.
* `LEDGER_AUTH_CLIENT_CERT_ENABLED` (default `0`) whether or not to allow TLS Client Certificate authentication (requires HTTPS).
* `LEDGER_USE_HTTPS` (default `0`) whether or not to run the server using HTTPS.
* `LEDGER_TLS_KEY` (default: none) the path to the server private key file. Required if using HTTPS.
* `LEDGER_TLS_CERTIFICATE` (default: none) the path to the server certificate file. Required if using HTTPS.
* `LEDGER_TLS_CRL` (default: none) the path to the server certificate revokation list file. Optional if using HTTPS.
* `LEDGER_TLS_CA` (default: none) the path to a trusted certificate to be used in addition to using the [default list](https://github.com/nodejs/node/blob/v4.3.0/src/node_root_certs.h). Optional if using HTTPS.
* `LEDGER_SIGNING_PRIVATE_KEY` (default: none) the path to the file containing the private key used to sign ledger notifications.
* `LEDGER_SIGNING_PUBLIC_KEY` (default: none) the path to the file containing the public key for notification signatures.
* `LEDGER_FEATURE_CREDIT_AUTH` (default: `0`) whether or not to require credits to be authorized.
* `LEDGER_CURRENCY_CODE` (default: none) ISO 4217 currency code
* `LEDGER_CURRENCY_SYMBOL` (default: none) currency symbol
* `LEDGER_AMOUNT_PRECISION` (default: `10`) the total precision allowed in amounts
* `LEDGER_AMOUNT_SCALE` (default: `2`) the number of digits allowed in amounts to the right of the decimal place
* `LEDGER_LOG_LEVEL` (default: `info`) the allowed levels in order of verbosity are `fatal`, `error`, `warn`, `info`, `debug`, and `trace`
* `LEDGER_RECOMMENDED_CONNECTORS` (default: `'*'`) a comma-delimited list of connector usernames
* `LEDGER_SECRET` (default: random bytes) a secret used to sign `/auth_token` tokens. Any length.

## RPC Error Codes
<a id='rpc_error_codes'></a>

| Error Code | Description | Applicable Methods |
| ---------- | ----------- | ------------------ |
| `-32700` | Error parsing incoming message JSON | any |
| `-32600` | Request didn't match `RpcRequest` schema | any |
| `-32601` | Unknown method | any |
| `-32602` | Invalid parameters | any |
| `4000` | Request id is null | any |
| `4001` | Invalid account name | `subscribe_account` |
| `4002` | Invalid account | `subscribe_account` |
| `4003` | Not authorized | any |
| `5000` | Internal server error | any |
