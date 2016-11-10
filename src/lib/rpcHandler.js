'use strict'
const UnauthorizedError = require('five-bells-shared/errors/unauthorized-error')
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')

class RpcHandler {
  constructor (params, websocket, requestingUser) {
    this.log = params.log
    this.uri = params.uriManager
    this.validator = params.validator
    this.notificationBroadcaster = params.notificationBroadcaster

    this.websocket = websocket
    this.requestingUser = requestingUser
    this.accountSubscriptions = []
    this.sendNotification = this._sendNotification.bind(this)

    websocket.on('message', (reqMessageString) => {
      try {
        this.handleMessage(JSON.parse(reqMessageString))
      } catch (err) {
        this.log.warn('error parsing message', reqMessageString, err.message)
      }
    })
    websocket.on('close', this.removeAccountSubscriptions.bind(this))
    this._send({ jsonrpc: '2.0', id: null, method: 'connect' })
  }

  handleMessage (reqMessage) {
    const validatorResult = this.validator.create('RpcRequest')(reqMessage)
    if (!validatorResult.valid) throw new Error(validatorResult.errors[0])
    if (reqMessage.id === null) throw new InvalidBodyError('Invalid id')

    const resMessage = { jsonrpc: '2.0', id: reqMessage.id }
    try {
      if (reqMessage.method === 'subscribe_account') {
        resMessage.result = this.subscribeAccount(reqMessage.params.eventType,
          reqMessage.params.accounts)
      } else {
        throw new InvalidBodyError('Unknown method: ' + reqMessage.method)
      }
    } catch (err) {
      const statusCode = err instanceof InvalidBodyError ? 400
                       : err instanceof UnauthorizedError ? 403 : 500
      resMessage.error = {
        code: statusCode,
        message: err.name,
        data: err.message
      }
    }

    if (resMessage.result === undefined && !resMessage.error) return
    this._send(resMessage)
  }

  /**
   * @param {String} eventType
   * @param {URI[]} accounts
   */
  subscribeAccount (eventType, accounts) {
    if (typeof eventType !== 'string' || !Array.isArray(accounts)) {
      throw new InvalidBodyError('Invalid params')
    }

    const accountNames = accounts.map(this._accountToName, this)
    this._validateAccountNames(accountNames)

    // Clear the old subscriptions.
    this.removeAccountSubscriptions()

    for (const accountName of accountNames) {
      const eventName = 'notification:' + accountName + ':' + eventType
      this.log.info('new ws subscriber for ' + eventName)
      this.notificationBroadcaster.addListener(eventName, this.sendNotification)
      this.websocket.on('close', () =>
        this.notificationBroadcaster.removeListener(eventName, this.sendNotification))
      this.accountSubscriptions.push(eventName)
    }

    // Updated number of active account subscriptions on this WebSocket connection.
    return accounts.length
  }

  removeAccountSubscriptions () {
    for (const eventName of this.accountSubscriptions) {
      this.notificationBroadcaster.removeListener(eventName, this.sendNotification)
    }
    this.accountSubscriptions = []
  }

  _validateAccountNames (accountNames) {
    for (const accountName of accountNames) {
      const validatorResult = this.validator.create('Identifier')(accountName)
      if (!validatorResult.valid) {
        throw new InvalidBodyError('Invalid account: ' + accountName)
      }
    }

    if (this.requestingUser.is_admin) return
    for (const accountName of accountNames) {
      if (this.requestingUser.name !== accountName) {
        throw new UnauthorizedError('Not authorized')
      }
    }
  }

  _accountToName (account) {
    try {
      return this.uri.parse(account, 'account').name.toLowerCase()
    } catch (err) {
      throw new InvalidBodyError('Invalid account: ' + account)
    }
  }

  _sendNotification (notification) {
    this._send({
      jsonrpc: '2.0',
      id: null,
      method: 'notify',
      params: notification
    })
  }

  _send (resMessage) {
    this.websocket.send(JSON.stringify(resMessage), (error) => {
      if (error) {
        this.log.error('failed to send notification to ' + this.requestingUser.name, error)
      }
    })
  }
}

module.exports = RpcHandler
