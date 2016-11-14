'use strict'
const BaseError = require('five-bells-shared/errors/base-error')

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

    websocket.on('message', this.handleMessage.bind(this))
    websocket.on('close', this.removeAccountSubscriptions.bind(this))
    this._send({ jsonrpc: '2.0', id: null, method: 'connect' })
  }

  handleMessage (reqMessageString) {
    const resMessage = { jsonrpc: '2.0', id: null }
    try {
      const reqMessage = JSON.parse(reqMessageString)
      const validatorResult = this.validator.create('RpcRequest')(reqMessage)
      if (!validatorResult.valid) {
        throw new RpcError(-32600, 'Invalid Request', {validationErrors: validatorResult.errors})
      }
      if (reqMessage.id === null) throw new RpcError(4000, 'Invalid id')
      resMessage.id = reqMessage.id

      if (reqMessage.method === 'subscribe_account') {
        resMessage.result = this.subscribeAccount(reqMessage.params.eventType,
          reqMessage.params.accounts)
      } else {
        throw new RpcError(-32601, 'Unknown method: ' + reqMessage.method)
      }
    } catch (err) {
      resMessage.error = {
        code: err instanceof SyntaxError ? -32700 : (err.code || 5000),
        message: err.name + ': ' + err.message,
        data: Object.assign({
          name: err.name,
          message: err.message
        }, err.data || {})
      }
    }
    this._send(resMessage)
  }

  /**
   * @param {String} eventType
   * @param {URI[]} accounts
   */
  subscribeAccount (eventType, accounts) {
    if (typeof eventType !== 'string' || !Array.isArray(accounts)) {
      throw new RpcError(-32602, 'Invalid params')
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
        throw new RpcError(4001, 'Invalid account name: ' + accountName)
      }
    }

    if (this.requestingUser.is_admin) return
    for (const accountName of accountNames) {
      if (this.requestingUser.name !== accountName) {
        throw new RpcError(4003, 'Not authorized')
      }
    }
  }

  _accountToName (account) {
    try {
      return this.uri.parse(account, 'account').name.toLowerCase()
    } catch (err) {
      throw new RpcError(4002, 'Invalid account: ' + account)
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

class RpcError extends BaseError {
  constructor (code, message, data) {
    super(message)
    this.code = code
    this.data = data || {}
  }
}

module.exports = RpcHandler
