define({ "api": [
  {
    "type": "get",
    "url": "/accounts/:name",
    "title": "Fetch user info",
    "name": "GetAccount",
    "group": "Account",
    "version": "1.0.0",
    "description": "<p>Get information about a user. Only users themselves and admins are allowed to see the full account details.</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "name",
            "description": "<p>Account's unique identifier</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Get account",
        "content": "curl -x GET -H \"Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l\"\nhttp://usd-ledger.example/USD/accounts/alice",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "200 Authenticated Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"id\": \"http://usd-ledger.example/USD/accounts/alice\",\n  \"name\": \"alice\",\n  \"balance\": \"100\",\n  \"is_disabled\": false\n}",
          "type": "json"
        },
        {
          "title": "200 Unauthenticated Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"id\": \"http://usd-ledger.example/USD/accounts/alice\",\n  \"name\": \"alice\",\n  \"ledger\": \"http://usd-ledger.example/USD\"\n}",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/accounts.js",
    "groupTitle": "Account",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "NotFoundError",
            "description": "<p>The requested resource could not be found.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidUriParameterError",
            "description": "<p>(One of) the provided URI parameter(s) was invalid.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "NotFoundError",
          "content": "HTTP/1.1 404 Not Found\n{\n  \"id\": \"NotFoundError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "InvalidUriParameterError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidUriParameterError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        }
      ]
    }
  },
  {
    "type": "get",
    "url": "/connectors",
    "title": "Fetch connectors",
    "name": "GetConnectors",
    "group": "Account",
    "version": "1.0.0",
    "description": "<p>Get all accounts of all connectors on this ledger.</p>",
    "examples": [
      {
        "title": "Get connectors",
        "content": "curl -x GET\nhttp://usd-ledger.example/USD/connectors",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "200 Response:",
          "content": "HTTP/1.1 200 OK\n[\n  {\n    id: 'http://usd-ledger.example/USD/accounts/chloe',\n    name: 'chloe',\n    connector: 'http://usd-eur-connector.example'\n  }\n]",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/accounts.js",
    "groupTitle": "Account"
  },
  {
    "type": "put",
    "url": "/accounts/:name",
    "title": "Create or update a user",
    "name": "PutAccount",
    "group": "Account",
    "version": "1.0.0",
    "description": "<p>Create or update a user. Only admins are allowed to create new accounts.</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "name",
            "description": "<p>Account's unique identifier</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Put account",
        "content": "curl -x PUT -H \"Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l\"\n-H \"Content-Type: application/json\"\n-d '{\"name\": \"alice\", \"balance\": \"100\"}'\nhttp://usd-ledger.example/USD/accounts/alice",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "200 Get Account Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"id\": \"http://localhost/accounts/alice\",\n  \"name\": \"alice\",\n  \"balance\": \"100\",\n  \"is_disabled\": false\n}",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/accounts.js",
    "groupTitle": "Account",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "UnauthorizedError",
            "description": "<p>You do not have permissions to access this resource.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidUriParameterError",
            "description": "<p>(One of) the provided URI parameter(s) was invalid.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidBodyError",
            "description": "<p>The submitted JSON entity does not match the required schema.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "UnauthorizedError",
          "content": "HTTP/1.1 403 Forbidden\n{\n  \"id\": \"UnauthorizedError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "InvalidUriParameterError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidUriParameterError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        },
        {
          "title": "InvalidBodyError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidBodyError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        }
      ]
    }
  },
  {
    "type": "get",
    "url": "/accounts/:name/transfers",
    "title": "[Websocket] Subscribe to transfers",
    "name": "SubscribeAccountTransfers",
    "group": "Account",
    "version": "1.0.0",
    "description": "<p>Subscribe to an account's transfers and receive real-time notifications via websocket.</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "name",
            "description": "<p>Account's unique identifier</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Subscribe to account transfers",
        "content": "wscat --auth alice:alice -c ws://example.com/accounts/alice/transfers",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "200 Get Account Response:",
          "content": "HTTP/1.1 101 Switching Protocols\n{\n  \"resource\":{\n    \"debits\":[\n      {\n        \"account\":\"http://localhost/accounts/alice\",\n        \"amount\":\"0.01\",\n        \"authorized\":true\n      }\n    ],\n    \"credits\":[\n      {\n        \"account\":\"http://localhost/accounts/bob\",\n        \"amount\":\"0.01\"\n      }\n    ],\n    \"id\":\"http://localhost/transfers/4f122511-989d-101e-f938-573993b75e22\",\n    \"ledger\":\"http://localhost\",\n    \"state\":\"executed\",\n    \"timeline\":{\n      \"proposed_at\":\"2016-04-27T17:57:27.037Z\",\n      \"prepared_at\":\"2016-04-27T17:57:27.054Z\",\n      \"executed_at\":\"2016-04-27T17:57:27.060Z\"\n    }\n  }\n}\n(... more events ...)",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/accounts.js",
    "groupTitle": "Account",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "UnauthorizedError",
            "description": "<p>You do not have permissions to access this resource.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidUriParameterError",
            "description": "<p>(One of) the provided URI parameter(s) was invalid.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "UnauthorizedError",
          "content": "HTTP/1.1 403 Forbidden\n{\n  \"id\": \"UnauthorizedError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "InvalidUriParameterError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidUriParameterError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        }
      ]
    }
  },
  {
    "type": "get",
    "url": "/",
    "title": "Get the server metadata",
    "name": "GetMetadata",
    "group": "Metadata",
    "version": "1.0.0",
    "description": "<p>This endpoint will return server metadata.</p>",
    "filename": "src/controllers/metadata.js",
    "groupTitle": "Metadata"
  },
  {
    "type": "get",
    "url": "/transfers/:id",
    "title": "Get local transfer object",
    "name": "GetTransfer",
    "group": "Transfer",
    "version": "1.0.0",
    "description": "<p>Use this to query about the details or status of a local transfer.</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "id",
            "description": "<p>Transfer <a href=\"http://en.wikipedia.org/wiki/Universally_unique_identifier\">UUID</a>.</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Get a transfer",
        "content": "curl -x GET http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "Transfer Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"id\": \"http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204\",\n  \"ledger\": \"http://usd-ledger.example/USD\",\n  \"debits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/alice\",\n    \"amount\": \"50\"\n  }],\n  \"credits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/bob\",\n    \"amount\": \"50\"\n  }],\n  \"execution_condition\": \"cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2\",\n  \"expires_at\": \"2015-06-16T00:00:01.000Z\",\n  \"state\": \"executed\",\n  \"timeline\": {\n    \"proposed_at\": \"2015-06-16T00:00:00.000Z\",\n    \"prepared_at\": \"2015-06-16T00:00:00.500Z\",\n    \"executed_at\": \"2015-06-16T00:00:00.999Z\"\n  }\n}",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/transfers.js",
    "groupTitle": "Transfer",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "NotFoundError",
            "description": "<p>The requested resource could not be found.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidUriParameterError",
            "description": "<p>(One of) the provided URI parameter(s) was invalid.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "NotFoundError",
          "content": "HTTP/1.1 404 Not Found\n{\n  \"id\": \"NotFoundError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "InvalidUriParameterError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidUriParameterError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        }
      ]
    }
  },
  {
    "type": "get",
    "url": "/transfers/:id/fulfillment",
    "title": "Get a transfer's fulfillment",
    "name": "GetTransferFulfillment",
    "group": "Transfer",
    "version": "1.0.0",
    "description": "<p>Retrieve the fulfillment for a transfer that has been executed or cancelled</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "id",
            "description": "<p>Transfer <a href=\"http://en.wikipedia.org/wiki/Universally_unique_identifier\">UUID</a>.</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Get Transfer Fulfillment:",
        "content": "curl -x GET\nhttp://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/fulfillment",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "200 Fulfillment Response:",
          "content": "HTTP/1.1 200 OK\ncf:0:_v8",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/transfers.js",
    "groupTitle": "Transfer",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "NotFoundError",
            "description": "<p>The requested resource could not be found.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "NotFoundError",
          "content": "HTTP/1.1 404 Not Found\n{\n  \"id\": \"NotFoundError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        }
      ]
    }
  },
  {
    "type": "get",
    "url": "/transfers/:id/state",
    "title": "Get the state of a transfer",
    "name": "GetTransferState",
    "group": "Transfer",
    "version": "1.0.0",
    "description": "<p>Use this to get a signed receipt containing only the id of transfer and its state. It functions even if the transfer doesn't exist yet. If the transfer doesn't exist it will have the state <code>&quot;nonexistent&quot;</code>.</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "id",
            "description": "<p>Transfer <a href=\"http://en.wikipedia.org/wiki/Universally_unique_identifier\">UUID</a>.</p>"
          },
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "type",
            "description": "<p>The signature type</p>"
          },
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "condition_state",
            "description": "<p>The state to hash for preimage algorithms' conditions.</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Get a transfer state receipt",
        "content": "curl -x GET http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/state",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "Transfer State Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"message\":\n    {\n      \"id\": \"http://localhost/transfers/03b7c787-e104-4390-934e-693072c6eda2\",\n      \"state\": \"nonexistent\"\n    },\n  \"type\": \"ed25519-sha512\",\n  \"signer\": \"http://localhost\",\n  \"public_key\": \"9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0=\",\n  \"signature\": \"DPHsnt3/5gskzs+tF8LNne/3p9ZqFFWNO+mvUlol8geh3VeErLE3o3bKkiSLg890/SFIeUDtvHL3ruiZRcOFAQ==\"\n}",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/transfers.js",
    "groupTitle": "Transfer",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidUriParameterError",
            "description": "<p>(One of) the provided URI parameter(s) was invalid.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "InvalidUriParameterError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidUriParameterError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        }
      ]
    }
  },
  {
    "type": "put",
    "url": "/transfers/:id",
    "title": "Propose and prepare a transfer",
    "name": "PutTransfer",
    "group": "Transfer",
    "version": "1.0.0",
    "description": "<p>This endpoint is used to create and authorize transfers. When a transfer is created without authorization from the debited accounts it is in the <code>&quot;proposed&quot;</code> state. To authorize the transfer, the owner of the debited accounts must put the <code>&quot;authorized&quot;: true</code> flag on the debit referencing their account and this HTTP call must carry HTTP authorization. When all debited accounts have authorized the transfer it is <code>&quot;prepared&quot;</code> and funds are escrowed until the fulfillment is presented or the <code>expires_at</code> time is reached</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "id",
            "description": "<p>Transfer <a href=\"http://en.wikipedia.org/wiki/Universally_unique_identifier\">UUID</a>.</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Propose a Transfer:",
        "content": "curl -x PUT -H \"Content-Type: application/json\" -d\n'{\n  \"id\": \"http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204\",\n  \"ledger\": \"http://usd-ledger.example/USD\",\n  \"debits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/alice\",\n    \"amount\": \"50\"\n  }],\n  \"credits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/bob\",\n    \"amount\": \"50\"\n  }],\n  \"execution_condition\": \"cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2\",\n  \"expires_at\": \"2015-06-16T00:00:01.000Z\"\n}'\nhttp://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
        "type": "shell"
      },
      {
        "title": "Prepare a Transfer:",
        "content": "curl -x PUT -H \"Content-Type: application/json Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l\" -d\n'{\n  \"id\": \"http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204\",\n  \"ledger\": \"http://usd-ledger.example/USD\",\n  \"debits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/alice\",\n    \"amount\": \"50\",\n    \"authorized\": true\n  }],\n  \"credits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/bob\",\n    \"amount\": \"50\"\n  }],\n  \"execution_condition\": \"cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2\",\n  \"expires_at\": \"2015-06-16T00:00:01.000Z\"\n}'\nhttp://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "201 New Proposed Transfer Response:",
          "content": "HTTP/1.1 201 CREATED\n{\n  \"id\": \"http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204\",\n  \"ledger\": \"http://usd-ledger.example/USD\",\n  \"debits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/alice\",\n    \"amount\": \"50\"\n  }],\n  \"credits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/bob\",\n    \"amount\": \"50\"\n  }],\n  \"execution_condition\": \"cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2\",\n  \"expires_at\": \"2015-06-16T00:00:01.000Z\",\n  \"state\": \"proposed\"\n}",
          "type": "json"
        },
        {
          "title": "200 Prepared Transfer Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"id\": \"http://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204\",\n  \"ledger\": \"http://usd-ledger.example/USD\",\n  \"debits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/alice\",\n    \"amount\": \"50\",\n    \"authorized\": true\n  }],\n  \"credits\": [{\n    \"account\": \"http://usd-ledger.example/USD/accounts/bob\",\n    \"amount\": \"50\"\n  }],\n  \"execution_condition\": \"cc:0:3:8ZdpKBDUV-KX_OnFZTsCWB_5mlCFI3DynX5f5H2dN-Y:2\",\n  \"expires_at\": \"2015-06-16T00:00:01.000Z\",\n  \"state\": \"prepared\"\n}",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/transfers.js",
    "groupTitle": "Transfer",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InsufficientFundsError",
            "description": "<p>The source account does not have sufficient funds to satisfy the request.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "UnprocessableEntityError",
            "description": "<p>The provided entity is syntactically correct, but there is a generic semantic problem with it.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "AlreadyExistsError",
            "description": "<p>The specified entity already exists and may not be modified.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidUriParameterError",
            "description": "<p>(One of) the provided URI parameter(s) was invalid.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidBodyError",
            "description": "<p>The submitted JSON entity does not match the required schema.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "InsufficientFundsError",
          "content": "HTTP/1.1 422 Unprocessable Entity\n{\n  \"id\": \"InsufficientFundsError\",\n  \"message\": \"Error description here.\",\n  \"owner\": \"bob\"\n}",
          "type": "json"
        },
        {
          "title": "UnprocessableEntityError",
          "content": "HTTP/1.1 422 Unprocessable Entity\n{\n  \"id\": \"UnprocessableEntityError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "AlreadyExistsError",
          "content": "HTTP/1.1 422 Unprocessable Entity\n{\n  \"id\": \"AlreadyExistsError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "InvalidUriParameterError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidUriParameterError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        },
        {
          "title": "InvalidBodyError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidBodyError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        }
      ]
    }
  },
  {
    "type": "put",
    "url": "/transfers/:id/fulfillment",
    "title": "Execute a prepared transfer",
    "name": "PutTransferFulfillment",
    "group": "Transfer",
    "version": "1.0.0",
    "description": "<p>Execute or cancel a transfer that has already been prepared. Putting the fulfillment of either the <code>execution_condition</code> or the <code>cancellation_condition</code>, if there is one, will execute or cancel the transfer, respectively.</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "id",
            "description": "<p>Transfer <a href=\"http://en.wikipedia.org/wiki/Universally_unique_identifier\">UUID</a>.</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Put Transfer Fulfillment:",
        "content": "curl -x PUT -H \"Content-Type: text/plain\" -d\n'cf:0:_v8'\nhttp://usd-ledger.example/USD/transfers/3a2a1d9e-8640-4d2d-b06c-84f2cd613204/fulfillment",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "201 Fulfillment Accepted Response:",
          "content": "HTTP/1.1 200 OK\ncf:0:_v8",
          "type": "json"
        }
      ]
    },
    "filename": "src/controllers/transfers.js",
    "groupTitle": "Transfer",
    "error": {
      "fields": {
        "Error 4xx": [
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "UnmetConditionError",
            "description": "<p>Execution Condition Not Met</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "UnprocessableEntityError",
            "description": "<p>The provided entity is syntactically correct, but there is a generic semantic problem with it.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidUriParameterError",
            "description": "<p>(One of) the provided URI parameter(s) was invalid.</p>"
          },
          {
            "group": "Error 4xx",
            "optional": false,
            "field": "InvalidBodyError",
            "description": "<p>The submitted JSON entity does not match the required schema.</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "UnmetConditionError",
          "content": "HTTP/1.1 422 Unprocessable Entity\n{\n  \"id\": \"UnmetConditionError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "UnprocessableEntityError",
          "content": "HTTP/1.1 422 Unprocessable Entity\n{\n  \"id\": \"UnprocessableEntityError\",\n  \"message\": \"Error description here.\"\n}",
          "type": "json"
        },
        {
          "title": "InvalidUriParameterError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidUriParameterError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        },
        {
          "title": "InvalidBodyError",
          "content": "HTTP/1.1 400 Bad Request\n{\n  \"id\": \"InvalidBodyError\",\n  \"message\": \"Error description here.\",\n  \"validationErrors\": [ ... ]\n}",
          "type": "json"
        }
      ]
    }
  }
] });
