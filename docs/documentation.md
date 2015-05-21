
Documentation
=============

What is Five Bells?
-------------------
_A high level overview of the Five Bells protocol._

![logo.svg](https://www.filepicker.io/api/file/YvAirRET9OZGOd4mvj3n)

There are many different ledgers out there and many different methods for transferring money between them. Five Bells aims to create a standard interface, so that different settlement methods can compete and users can automatically find the best option for them.

### A Framework for the Value Web

The Web has successfully connected the world's information, but payment systems remain disconnected. The financial world is missing a common language analogous to HTTP on the Web.

The power of the Web lies in the lateral organization of information via links. This creates an immensely simple, scalable and extensible system. Five Bells seeks to create similar primitives - ledgers are financial documents and traders are the links that connect and provide liquidity between them.

### Why the Name "Five Bells"?

Five Bells was a tavern in the City of London which was the site of the first daily [cheque clearing ritual](https://en.wikipedia.org/wiki/Bankers%27_clearing_house#Predecessors) in England. From around 1770, bankers would meet at Five Bells and exchange cash in order to settle their balances all at once.

Before Five Bells, banks would have clerks running around visiting other banks all day and [legend has it](http://www.theguardian.com/money/2008/feb/03/personalfinancenews.consumeraffairs1) that two exhausted messengers were taking a break and recognized each other at a crowded inn. And thus the idea of meeting in a central place every day was born.

With the Five Bells protocol, we're aiming to create a venue for another orders-of-magnitude improvement in settlement efficiency. And we're looking to do it in the spirit of simple and pragmatic solutions.


The Five Roles
--------------
_Sender, Sending Ledger, Trader, Receiving Ledger, Recipient_

In the Five Bells model, there are five distinct roles, referring the five actors typically involved in a cross-ledger payment.

### Sender

![RoleSender.svg](https://www.filepicker.io/api/file/GXv88bUSrmZ6EeKjkrjU)

The sender is the owner of the funds at the start of a cross-ledger payment. Their objective is to pay the trader if and only if the recipient got paid as well.

Payments can be initiated by any party, but no matter who initiates the payment, an authorization from the sender will always be required.

Sender-initiated payments are also known as **push** payments.

### Recipient

![RoleRecipient.svg](https://www.filepicker.io/api/file/vNTbzye3Q76bYP5JIRDv)

The recipient is the owner of the funds after the successful completion of a cross-ledger payment. Receivers may be merchants who will generally monitor their account on the receiving gateway and - upon receipt of funds into their account - provide some good or service.

Receiver-initiated payments are also known as **pull** payments.

### Sending Ledger

![RoleSendingLedger.svg](https://www.filepicker.io/api/file/BVd4dnbuRYelo18jvPWJ)

The sending ledger is trusted by the sender and by the trader to hold funds on their behalf.


### Receiving Ledger

![RoleReceivingLedger.svg](https://www.filepicker.io/api/file/b1yZm7xTaO1yYcovMSOY)

The receiving ledger is trusted by the recipient and by the trader to hold funds for them. 

### Settlement System

![RoleReceivingLedger.svg](https://www.filepicker.io/api/file/xZyC9FaT3CrYhPyKmWYA)

The settlement system is the entity which acts as counterparty to the payment. It has accounts at both the sending and receiving ledger. Since it is unlikely that a single trader will have accounts at a huge number of ledgers, settlement systems will usually in fact be a network of traders working together to facilitate the payment. See [Trading Architectures](doc:trading-architectures). 

In a cross-ledger payment, the trader generally acts as the primary message broker.

> #### The four party scheme
>
>  Card providers such as VISA and MasterCard often use the [four-party scheme](http://en.wikipedia.org/wiki/Card_scheme#Four-party_scheme) to model payment transactions. This maps very closely to Five Bells, with the card scheme itself (and its associated settlement mechanism) as the implicit fifth actor.

>  * Cardholder → Sender
>  * Merchant → Recipient
>  * Issuer → Sending Ledger
>  * Acquirer → Receiving Ledger
>  * (Network → Trader)"


Settlement Type A
-----------------
_Type A is the normal method for payments when the trader is trusted by both ledgers._

In a type A payment, the trader is trusted by both participating ledgers and acts as the transaction leader.

![Type A Payment.svg](https://www.filepicker.io/api/file/twxUmDigTZ2LOq3wLbZY)

### Atomicity

In type A payments, both ledgers will place holds with no timeout or a very generous timeout (e.g. several days). This ensures atomicity of the payment as long as the trader does not fail or become unavailable.

Therefore, the availability of the trader is crucial. Generally, type A payments are recommended only when the "trader" is a highly fault-tolerant [exchange network](doc:trading-architectures).

The benefit of this atomicity is the elimination of settlement risk. Even complex multi-ledger payments can be handled safely and efficiently by a trader-coordinator.

> #### Settlement risk
>
>  Settlement risk is also known as Herstatt risk, named after a German bank >that failed in 1974. Because of this, a large number of cross-currency >transactions only partially executed. Banks had transferred Deutsche Mark >funds to Herstatt, but the corresponding US dollars were never delivered.

### Sequence

Here is an example sequence for a type A payment initiated by the sender (push).

![Type A Payment Sequence.svg](https://www.filepicker.io/api/file/qqRVv3ktREeBtF618NNn)


Settlement Type M
-----------------
_When no mutually trusted trader is available, ledgers can fall back to a type M settlement._

In a type M payment, the trader is untrusted. The payment is **not** atomic and the trader takes on the settlement risk. However, sender and recipient are still protected against a malicious trader. The worst a malicious trader can do is delay causing the payment to fail after a timeout.

![Type M Payment.svg](https://www.filepicker.io/api/file/KJUh2o5iS3q3o2oiHKww)

Type M is recommended as a fallback when a Type A payment is impossible because no suitable trader which is trusted by both ledgers could be found.

### Sequence

Here is an example sequence for a Type M payment initiated by the sender (push).

![Type M Payment Sequence.svg](https://www.filepicker.io/api/file/7ONI4HzCTYIBSIVo4RpO)

