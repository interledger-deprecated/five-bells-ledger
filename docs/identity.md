
Identity
========

Identity Primer
---------------
_A quick primer on identity and payments._

Why do we need identity? Identity is required when a system controls resources and we wish to make these resources excludable, i.e. only a specific person or persons have control over those resources.

We call systems that control resources and therefore require an identity layer **custodial systems**.

### Custodial systems

Custodial systems refer to systems which control information or resources and wish to make these available to users based on their identity and authorizations.

The primary types of custodial systems are:

* **Vaults** store private information. Example: Ripple blobvault
* **Ledgers** track the ownership of assets. Example: Ripple network
* **Command & Control** systems allow users to exercise powers/privileges. Example: [Amazon AWS Management Console](http://aws.amazon.com/console/)

All types of custodial systems require authentication in order to associate capabilities with specific users. Some custodial systems also provide authorization, allowing users to convey their capabilities onto third parties.

### Elements of identity

So far we've been talking about identity as one large cluster of functionality. But this can be broken down into smaller pieces that represent different aspects of the identity puzzle.

The components that are relevant in the context of Five Bells are:

* Discovery
* Authentication
* Authorization
* Attestation

### Discovery

Discovery refers to the ability to associate identifiers with data.

The most well-known discovery system is perhaps the Domain Name System (DNS). It associates short human-readable identifiers (e.g. `google.com`) with data such as IP addresses (e.g. 206.169.145.216).

Usually discovery is used as the first step in interacting with an identifier. Some example queries that a discovery system might get are:

* Q: I am **alice**, how do I authenticate?
  A: Authenticate via password at https://example.auth.5bells.net
* Q: I would like to send a message to **hugh@example.com**, how can I reach him?
  A: Use SMTP to connect to mail.example.com and submit an email to user "hugh".

### Authentication

Authentication is the process by which a user can prove who they are. Essentially a given user is able to put on the mantle of a given logical identity.

Examples for authentication mechanisms include password-based mechanisms, two-factor authentication, etc.

Several standards aim to provide authentication which abstracting away the exact mechanism used. For instance the [FIDO specification](https://fidoalliance.org/) allows users to authenticate with a service like [Facebook](https://facebook.com) using a finger print reader, without that service having to be aware of the vendor of that specfic device.

[OpenID Connect](https://openid.net/connect/) is a standard for third-party authentication. In other words, it allows users to authenticate with one counterparty (the "identity provider") and use that authentication to interact with third parties (the "relying parties").

### Authorization

Authorization is the process by which a user can provide a third party with - usually temporary and limited - access to their private data, assets or privileges.

The most prominent standard for authorization in use today is OAuth2.

> ### Authorization Proxy
> Suppose a custodial system, which does not possess an authorization system. >   other words, in this system users can only provide third parties with >   cess if they share their identity, making the third party indistinguishable > om the user.
> In order to add authorization to such a system, we may create a proxy, which > ovides flexible authorizations on the front end and knows the key to > teract with the custodial system on the backend.
> For instance, the Ripple network gives unrestricted control to the owner of each account's signing key. However, if we give that signing key to an authorization proxy, the proxy can enforce fine-grained access controls for the account.

### Attestation

Attestation refers to the process of creating witnessed associations between different identifiers. For instance, an attestor may vouch that the owner of a certain cryptographic key is a real person with a certain name, address and birth date.

Identifiers & Discovery
-----------------------

There are three types of identifiers in Five Bells:

* Usernames (e.g. `bob`)
* Hostnames (e.g. `example.com`)
* Remote users (e.g. `bob@example.com`)

If an identifier contains an at-symbol ("@"), it's a remote user. Else, if it contains a dot, it is a hostname. Otherwise it is a username.

### Usernames

Usernames are always local to the host you are talking to. If you wish to refer to a user at another host, use the remote user syntax.

### Hostnames

Hostnames are DNS hostnames. The way to discover link relations about a hostname is to use the [host-meta file](https://tools.ietf.org/html/rfc6415). 

### Remote users

Remote users are usernames that are local to another host than the one you are currently talking to. To refer to a remote user, you would use the at-syntax (e.g. `bob@example.com`). 

In order to discover link relations about a remote user, the [Webfinger protocol](https://tools.ietf.org/html/rfc7033) is used.

Authorization
-------------
_Allowing third-parties to act on your behalf._

For authorization Five Bells uses [OAuth2](http://oauth.net/2/).

### Identity authorization

Identity information consists of fields (such as name, email address, phone number, etc.) and [attestations](doc:identity-primer).

For fields, there are two types of [scopes](http://tools.ietf.org/html/rfc6749#section-3.3):

* Read-only access, e.g. `profile.email.read`
* Read-write access, e.g. `profile.email.write`

For attestations, there is only one scope, which includes the name of the attestor, e.g. `https://acme-attestor.com/auth/attestations/v1.0/phone-level1`

### Funds authorization

For funds access, scopes will start with the ledger hostname, followed by a format defined by each ledger. In the interest of clarity, a possible example of a full scope is provided here.

Examples:

* `https://acme-ledger.com/auth/USD`
* `https://zulu-ledger.com/auth/foo-issuer.com/USD?maxValue=300&period=3W`

