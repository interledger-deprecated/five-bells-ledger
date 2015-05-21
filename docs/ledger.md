
Ledger API
==========

Ledger Types
------------
_There are different kinds of ledgers, each with slightly different capabilities._

When we talk about ledgers, we mean lists of balances. Many types of organizations and systems maintain ledgers, the first that most people think of would be a bank. When you deposit cash with a bank, they will credit you a balance on their ledger.

But banks aren't the only kind of ledger. Bitcoin introduced the concept of a decentralized ledger. Some merchants like prepaid cellphone providers maintain ledgers to track their customers' prepaid balances. In fact, all businesses use ledgers to track their accounts payable and accounts receivable, i.e. what the owe to their vendors and are owed by their customers.

### Legacy ledgers

Legacy ledgers refer to any preexisting ledgers which have transfer capability, but do not support the Five Bells Ledger API.

If the ledger does not support locking/holds, they can be simulated via a special hold account and transfers into and out of that account. 

### Crypto-currency ledgers

Today's crypto-currency ledgers generally don't provide web-facing APIs. However, they can still participate in Five Bells via an adapter.

### Prepaid ledgers

Some ledgers do not allow the withdrawal of funds as cash, but only redemption in the form of products and services. These are known as closed-loop or prepaid ledgers. They are typically operated by merchants or groups of merchants, such as prepaid phone operators.

Some systems may allow transfers across multiple external ledgers

Transfers
---------
_Explanation of the transfer concept and lifecycle._

A transfer refers to the movement of funds from one or more source accounts to one or more destination accounts. Local transfers on a single ledger are [atomic](http://en.wikipedia.org/wiki/Atomicity_%28database_systems%29), meaning they either execute entirely or not at all.

### Basic Local Transfer

Here is a minimal example of a local transfer.

```js
  {
    "debits": [{
      "account": "alice",
      "amount": "100"
    }],
    "credits": [{
      "account": "bob",
      "amount": "100"
    }]
  }
```

This transfer represents a movement of 100 units of *something* from Alice to Bob. The type of asset is determined by the ledger this transfer happens on. Each ledger can only have one type of asset. If an organization (e.g. a bank) has balances in multiple types of assets, these would be separate ledgers from a Five Bells perspective.

Now let's modify our example to mention asset types explicitly and give it a minimum amount to be delivered:

```js
  {
    "debits": [{
      "account": "alice",
      "amount": "100"
    }],
    "credits": [{
      "account": "bob",
      "amount": "100"
    }]
  }
```

The asset type used in this example (`USD`) is an ISO currency code. Any locally unique identifier is acceptable, however for assets that are not ISO 4217 currencies, we recommend the use of [IRIs](http://en.wikipedia.org/wiki/Internationalized_resource_identifier) as identifiers, e.g. `https://www.nyse.com/quote/XNAS:AAPL`. These have the benefits of being globally unique and therefore less ambiguous and [dereferenceable](http://en.wikipedia.org/wiki/Dereferenceable_Uniform_Resource_Identifier).

### Transfer Lifecycle

Each transfer passes through a series of steps from initial proposal to final execution.

![Transfer Lifecycle.svg](https://www.filepicker.io/api/file/OSxz2chVQqOiwmswJdtR)

Initially, when a transfer is *created*, it exists in the **proposed** state. A proposed transfer is purely informational and does not affect the state of the world.

Ledgers may (and usually should) allow users to propose transfers without having authorization from all the participants. Once a transfer is proposed, each individual party may update the transfer by adding their authorization. Once all required authorizations are available, the transfer is checked for feasibility. Compliance and funds availability (as well as any other state-dependent checks) are performed at this point. If any of them fail, the transfer is permanently **rejected**. If they all succeed, the transfer will move to the **pre-prepared** state.

The ledger will now attempt to place a hold on any funds that are debited as part of this transfer. From an accounting perspective, the funds are moved from the origin accounts to a special holding account that is specific to this transfer. Once this has completed successfully, the transfer moves to the **prepared** state.

Transfers may have execution criteria, in which case they will remain in the prepared state until those criteria are met or the transfer expires. Note that while a transfer is in the prepared state, the source funds are held. When the execution criteria are met, the transfer progresses to the **pre-executed** state.

Now the ledger will try to apply the transaction. Since the transaction is prepared, pre-approved and the funds are held, this should always succeed unless there is an error in the ledger or in its underlying infrastructure. If such an error occurs, the transfer may still be rejected, otherwise it progresses to the final **executed** state.

There are only two final states: **executed** and **rejected**. Transfers may have an expiry date. A transfer may expire at any point before it reaches the **pre-executed** state or any final state.


**get** Request a Quote
-----------------------
_Requesting a quote from a trader._

|Property            |required  |Type    |Description |
|--------------------|----------|--------|------------|
|source_ledger       |required  |String  |Ledger where funds should originate |
|destination_ledger  |required  |String  |Ledger where funds should arrive |
|source_asset        |          |String  |Asset used by the source account |
|destination_asset   |          |String  |Asset used by the destination account |
|source_amount       |          |String  |Amount at the source |
|destination_amount  |          |String  |Amount at the destination |

The first step to most payments is to request a quote for the payment.

Either the source amount or the destination amount should have a value specified, but not both. The quote will be created with respect to the unspecified side of the trade.


#### Definition

  https://example.com/quote

#### Result Format

  200 OK ·  400 Bad Request

```js
  {
    "source": {
      "owner": "alice@acme.ledger.5bells.net",
      "value": "120",
      "currency": "USD",
      "issuer": "acme.ledger.5bells.net",
      "ledger": "acme.ledger.5bells.net"
    },
    "destination": {
      "owner": "bob@acme.ledger.5bells.net",
      "value": "100",
      "currency": "EUR",
      "issuer": "zulu.ledger.5bells.net",
      "ledger": "zulu.ledger.5bells.net"
    }
  }
```

**put**	Make a Local Transfer
-----------------------------
_Transfer funds locally on a ledger._

|Property            |required  |Type    |Description |
|--------------------|----------|--------|------------|
|source_funds        | required |  Mixed | One or more SourceFunds objects representing the funds flowing into the transaction|
|destination_funds	 |required  |  Mixed | One or more DestinationFunds objects representing the funds flowing out of the transaction|

The simplest case for a payment is a local payment between two users of the same ledger via the same currency with the same issuer.

```http
PUT /transfers/33930ab9-637e-4eb1-b5a9-a06b36af4e71
```

```js
{
  "source_funds": {
    "account": "alice",
    "amount": "100",
    "authorization": {
      "signature": {
        "type": "GraphSignature2012",
        "creator": "http://payswarm.example.com/i/john/keys/5",
        "created": "2011-09-23T20:21:34Z",
        "signatureValue": "OGQzNGVkMzVm4NTIyZTkZDYMmMzQzNmExMgoYzI43Q3ODIyOWM32NjI="
      }
    }
  },
  "destination_funds": {
    "account": "bob"
  }
}
```


#### Definition

  https://example.com/transfers/:uuid

#### Result Format

  200 OK ·  400 Bad Request

```js
{
  "source_funds": {
    "account": "alice",
    "amount": "100",
    "authorization": {
      "signature": {
        "type": "GraphSignature2012",
        "creator": "http://payswarm.example.com/i/john/keys/5",
        "created": "2011-09-23T20:21:34Z",
        "signatureValue": "OGQzNGVkMzVm4NTIyZTkZDYMmMzQzNmExMgoYzI43Q3ODIyOWM32NjI="
      }
    }
  },
  "destination_funds": {
    "account": "bob"
  }
}
```


**post**	Create a Funds Hold
---------------------------
_Placing a hold means that certain funds are not available until the hold is resolved._


|Property            |required  |Type    |Description |
|--------------------|----------|--------|------------|
|owner	             | required | String | Owner of the funds|
|value	             | required | String | Amount (as decimal string)|
|currency	           | required | String | ISO or other currency identifier|
|issuer	             | required | String | Issuer identifier|

In order to enable atomic transactions across ledgers, it is important that each ledger has the ability to precommit to transactions. This is done by creating a hold, i.e. locking funds up ahead of time, so that if the transaction succeeds at the other end, the funds are guaranteed to be available.

#### Definition

  https://example.com/hold

#### Result Format

  200 OK ·  400 Bad Request

```js
{
  "type": "hold",
  "owner": "alice@acme.ledger.5bells.net",
  "value": "100.00",
  "currency": "USD",
  "issuer": "acme.ledger.5bells.net"
}
```


Ledger Subscriptions
====================

**get** List Subscriptions
---------------------

Show existing subscriptions.

#### Definition

  https://example.com/subscription


**post**  Create Subscription
-----------------------------

This will register a [REST hook](http://resthooks.org/docs/) to listen for any events affecting a given account.

#### Definition

  https://example.com/subscription


**get** Subscription Details
----------------------------
Get information about an existing subscription.

#### Definition

  https://example.com/subscription/:id


**put** Update Subscription
---------------------------
_Change the parameters for an existing subscription._

Change the types of events or accounts a subscription is about.

#### Definition

  https://example.com/subscription/:id


Type Reference
==============

SourceFunds
-----------
An object describing funds flowing into a transfer.

|Field   |  Type        | Description|
|--------|--------------|--------------|
|account |  Identifier  |  Account that is holding the funds|


