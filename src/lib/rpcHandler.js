'use strict'
const BaseError = require('five-bells-shared/errors/base-error')

const errors = {
  INVALID_REQUEST: -32600,
  INVALID_METHOD: -32601,
  INVALID_PARAMS: -32602,
  SYNTAX_ERROR: -32700,
  INVALID_ID: 40000,
  INVALID_ACCOUNT_NAME: 40001,
  INVALID_ACCOUNT: 40002,
  UNAUTHORIZED: 40300,
  INTERNAL_ERROR: 50000
}

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
    this.pingInterval = setInterval(this._ping.bind(this), params.pingInterval)

    websocket.on('message', this.handleMessage.bind(this))
    websocket.on('close', this._onClose.bind(this))
    this._send({ jsonrpc: '2.0', id: null, method: 'connect' })
  }

  handleMessage (reqMessageString) {
    const resMessage = { jsonrpc: '2.0', id: null }
    try {
      const reqMessage = JSON.parse(reqMessageString)
      const validatorResult = this.validator.create('RpcRequest')(reqMessage)
      if (!validatorResult.valid) {
        throw new RpcError(errors.INVALID_REQUEST, 'Invalid Request', {validationErrors: validatorResult.errors})
      }
      if (reqMessage.id === null) throw new RpcError(errors.INVALID_ID, 'Invalid id')
      resMessage.id = reqMessage.id

      if (reqMessage.method === 'subscribe_account') {
        resMessage.result = this.subscribeAccount(reqMessage.params.eventType,
          reqMessage.params.accounts)
      } else if (reqMessage.method === 'subscribe_all_accounts') {
        resMessage.result = this.subscribeAllAccounts(reqMessage.params.eventType)
      } else {
        throw new RpcError(errors.INVALID_METHOD, 'Unknown method: ' + reqMessage.method)
      }
    } catch (err) {
      resMessage.error = {
        code: err instanceof SyntaxError ? errors.SYNTAX_ERROR : (err.code || errors.INTERNAL_ERROR),
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
      throw new RpcError(errors.INVALID_PARAMS, 'Invalid params')
    }

    const accountNames = accounts.map(this._accountToName, this)
    this._validateAccountNames(accountNames)

    // Clear the old subscriptions.
    this.removeAccountSubscriptions()

    for (const accountName of accountNames) {
      this.log.info('new ws subscriber for ' + accountName + ':' + eventType)
      this.notificationBroadcaster.addNotificationListener(accountName, eventType, this.sendNotification)
      this.accountSubscriptions.push({ accountName, eventType })
    }

    // Updated number of active account subscriptions on this WebSocket connection.
    return accounts.length
  }

  subscribeAllAccounts (eventType) {
    if (typeof eventType !== 'string') {
      throw new RpcError(errors.INVALID_PARAMS, 'Invalid params')
    }

    if (!this.requestingUser.is_admin) {
      throw new RpcError(errors.UNAUTHORIZED, 'Not authorized')
    }

    this.notificationBroadcaster.addNotificationListener('*', eventType, this.sendNotification)
    this.accountSubscriptions.push({ accountName: '*', eventType })

    return 1
  }

  _onClose () {
    clearInterval(this.pingInterval)
    this.removeAccountSubscriptions()
  }

  removeAccountSubscriptions () {
    for (const eventInfo of this.accountSubscriptions) {
      this.notificationBroadcaster.removeNotificationListener(
        eventInfo.accountName, eventInfo.eventType, this.sendNotification
      )
    }
    this.accountSubscriptions = []
  }

  // Keep the websocket connection alive.
  _ping () { this.websocket.ping() }

  _validateAccountNames (accountNames) {
    for (const accountName of accountNames) {
      const validatorResult = this.validator.create('Identifier')(accountName)
      if (!validatorResult.valid) {
        throw new RpcError(errors.INVALID_ACCOUNT_NAME, 'Invalid account name: ' + accountName)
      }
    }

    if (this.requestingUser.is_admin) return
    for (const accountName of accountNames) {
      if (this.requestingUser.name !== accountName) {
        throw new RpcError(errors.UNAUTHORIZED, 'Not authorized')
      }
    }
  }

  _accountToName (account) {
    try {
      return this.uri.parse(account, 'account').name.toLowerCase()
    } catch (err) {
      throw new RpcError(errors.INVALID_ACCOUNT, 'Invalid account: ' + account)
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

RpcHandler.websocketErrorCodes = errors
module.exports = RpcHandler
