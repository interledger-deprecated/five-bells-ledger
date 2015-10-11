
Payment API
==============

Payment Definition
---------------------
_In Five Bells the term payment is used with a broad, but clearly defined meaning._

When we talk about payment in the context of Five Bells, we mean the function that bridges the gap between sending ledger and receiving ledger. In essence, payment refers to the activity of effecting a payment on one ledger in exchange for a payment on another ledger.

![ifthen2.svg](https://www.filepicker.io/api/file/1uOe14RBqIIyZHKKr7SQ)

Note that both of the payments may have the same:

1. host ledger
2. currency/asset and/or
3. issuer/counterparty.

Typically though, at least one of these dimensions would be different, otherwise one would simply [make a local transfer](doc:make-a-local-transfer).

### Role of the payment system

The payment system is an abstract concept in the context of Five Bells. A payment system could be an individual trader, or it could be a decentralized network of many traders working together. Either way the payment system is the counterparty that takes the other side of a cross-ledger payment.

![TraderConnecting.svg](https://www.filepicker.io/api/file/PHd5FfdvQUWoSTkWyu0c)


Payment Architectures
------------------------
_Payment systems can take on different forms in Five Bells._

The trader in Five Bells must have an account with both the sending and receiving ledgers. Since it is unlikely for an individual liquidity provider to have a very large number of connections to different ledgers, we believe that traders will usually pool their liquidity work together to facilitate payments.

Many different architectures are possible, from simple to complex. This page is intended to give some examples of possible constellations.

### Fixed-rate solo trader

The simplest possible payment system is a fixed-rate solo trader has pools of funds at various ledgers and offers to provide payment between any of them at fixed rates, assuming that enough liquidity is available.

### Central exchange

A central exchange is a service run by a single operator, where traders may deposit funds and place orders. When participating in Five Bells, a central exchange essentially aggregates all of the liquidity that its participating traders provide.

### Exchange network

An exchange network is a network of traders working together, but without a central exchange operator or clearinghouse. An example of an exchange network is the Ripple network.

> ### Ripple Network",
> It's important to understand that Five Bells is not a replacement for the Ripple >network or similar technologies, it is simply a framework to formalize the interaction >between ledgers, users and payment systems such as Ripple.
> 
> In order to make Ripple compatible with Five Bells, an adapter would be required. To add a > ledger, the adapter would create an account on that ledger and issue balances on Ripple. It > would offer deposit and withdrawal functionality to market makers who could then place orders > on Ripple. The adapter would be able to act as a Five Bells trader between any two of the > ledgers it supports by converting the corresponding balances on Ripple.
> 
> The adapter solution shows that it is possible to use the Ripple network without modification in a Five Bells world. Ripple Labs is working on next-generation trading infrastructure that supports the Five Bells framework natively."


### Clearinghouses and credit lines

Central clearinghouses that track balances of groups of ledgers or bilateral credit lines between ledgers can facilitate same-currency transactions.

*drops mic*


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

**post**	Order a Payment
----------------------------
_This will initiate a new cross-ledger transfer._

|Property            |required  |Type    |Description |
|--------------------|----------|--------|------------|
|source              | required | Object | Full amount (including currency, issuer and ledger)|
|destination         | required | Object | Full amount (including currency, issuer and ledger)|

Once the payment user is happy with a trader's quote, they will initiate the payment.


#### Definition

  https://example.com/payment

