'use strict';

const moment = require('moment');
const defer = require('co-defer');
const db = require('../services/db');
const log = require('five-bells-shared/services/log')('expiry monitor');
const ExpiredTransferError = require('../errors/expired-transfer-error');

function TransferExpiryMonitor () {
  this.watchingIds = {};
}

TransferExpiryMonitor.prototype.validateNotExpired =
  function (transfer) {
  if (transfer.expires_at &&
    moment().isAfter(transfer.expires_at, moment.ISO_8601)) {

    throw new ExpiredTransferError('Cannot modify transfer ' +
      'after expires_at date');
  }
};

function *expireTransfer(transferId) {
  yield db.transaction(function*(tr) {
    let transfer = yield tr.get(['transfers', transferId]);

    if (transfer.state !== 'executed' &&
      transfer.state !== 'rejected' &&
      transfer.state !== 'failed') {

      transfer.state = 'rejected';
      transfer.rejected_at = moment().toISOString();
      tr.put(['transfers', transferId], transfer);
    }

    log.debug('expired transfer: ' + transferId);
  });
}

TransferExpiryMonitor.prototype.watch = function (transfer) {

  // Star the expiry countdown if we're not already watching it
  if (!this.watchingIds.hasOwnProperty(transfer.id)) {

    let now = moment();
    let expiry = moment(transfer.expires_at, moment.ISO_8601);
    if (transfer.expires_at && now.isBefore(expiry)) {

      let timeout = expiry.diff(now, 'milliseconds');
      this.watchingIds[transfer.id] =
        defer.setTimeout(expireTransfer.bind(this, transfer.id), timeout);

      log.debug('transfer ' + transfer.id +
        ' will expire in ' + timeout + 'ms');
    }

  } else if (transfer.state === 'executed' ||
             transfer.state === 'rejected' ||
             transfer.state === 'failed') {

    this.unwatch(transfer.id);
  }

};

TransferExpiryMonitor.prototype.unwatch = function (transferId) {
  log.debug('unwatch transfer: ' + transferId);

  if (this.watchingIds.hasOwnProperty(transferId)) {
    clearTimeout(this.watchingIds[transferId]);
    delete this.watchingIds[transferId];
  }
};

exports.TransferExpiryMonitor = TransferExpiryMonitor;
