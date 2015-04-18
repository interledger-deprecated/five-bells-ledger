/*global describe, it*/
'use strict';
const _ = require('lodash');
const crypto = require('crypto');
// const expect = require('chai').expect;
const app = require('../app');
const db = require('../services/db');
const config = require('../services/config');
const dbHelper = require('./helpers/db');
const appHelper = require('./helpers/app');
const logHelper = require('five-bells-shared/testHelpers/log');
const tweetnacl = require('tweetnacl');

function hashJSON (json) {
  let str = JSON.stringify(json);
  let hash = crypto.createHash('sha512').update(str).digest('base64');
  return hash;
}

describe('Transfer State', function () {
  logHelper();

  beforeEach(function *() {
    appHelper.create(this, app);

    // Set up keys
    config.keys.ed25519 = {
      secret: 'iMx6i3D3acJPc4aJlK0iT/pkJP3T+Dqte9wg6hXpXEv08CpNQSm1J5AI6n/' +
        'QVBObeuQWdQVpgRQTAJzLLJJA/Q==',
      public: '9PAqTUEptSeQCOp/0FQTm3rkFnUFaYEUEwCcyyySQP0='
    };

    this.keyPair =
      tweetnacl.sign.keyPair.fromSecretKey(
        tweetnacl.util.decodeBase64(config.keys.ed25519.secret));

    // Define example data
    this.completedTransfer = _.cloneDeep(require('./data/transfer_completed'));

    // Reset database
    yield dbHelper.reset();
  });

  describe('GET /transfers/:uuid/state', function() {

    it('should return a 404 if the transfer does not exist', function *() {
      yield this.request()
        .get('/transfers/03b7c787-e104-4390-934e-693072c6eda2/state')
        .expect(404)
        .end();
    });

    it('should return a 200 and a signed receipt including the message, ' +
      'messageHash, algorithm, public_key, and signature', function *() {

      yield db.create(['transfers'], this.completedTransfer);

      const stateReceipt = {
        id: this.formatId(this.completedTransfer, '/transfers/').id,
        state: this.completedTransfer.state
      };
      const stateReceiptHash = hashJSON(stateReceipt);
      const signature = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(stateReceiptHash),
          this.keyPair.secretKey));

      yield this.request()
        .get('/transfers/' + this.completedTransfer.id + '/state')
        .expect(200, {
          message: stateReceipt,
          messageHash: stateReceiptHash,
          algorithm: 'ed25519-sha512',
          signer: config.server.base_uri,
          public_key: config.keys.ed25519.public,
          signature: signature
        })
        .end();
    });

    it('should return the correct state if the transfer is prepared',
      function *() {

      const transfer = _.cloneDeep(this.completedTransfer);
      transfer.state = 'prepared';

      yield db.create(['transfers'], transfer);

      const stateReceipt = {
        id: this.formatId(transfer, '/transfers/').id,
        state: transfer.state
      };
      const stateReceiptHash = hashJSON(stateReceipt);
      const signature = tweetnacl.util.encodeBase64(
        tweetnacl.sign.detached(
          tweetnacl.util.decodeBase64(stateReceiptHash),
          this.keyPair.secretKey));

      yield this.request()
        .get('/transfers/' + transfer.id + '/state')
        .expect(200, {
          message: stateReceipt,
          messageHash: stateReceiptHash,
          algorithm: 'ed25519-sha512',
          signer: config.server.base_uri,
          public_key: config.keys.ed25519.public,
          signature: signature
        })
        .end();
    });
  });
});
