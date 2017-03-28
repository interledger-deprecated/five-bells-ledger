'use strict'

function createMock () {
  const mockGetAccount = function () {
    throw new Error('DB was queried')
  }
  let mock = {}
  mock.getAccount = mockGetAccount
  return mock
}

module.exports = createMock()
