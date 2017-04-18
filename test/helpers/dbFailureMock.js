const mock = require('mock-require')

const RealUtils = require('../../src/models/db/utils')
const mockUtils = function () {
  const utils = RealUtils.apply(null, arguments)
  const realGetTransaction = utils.getTransaction
  utils.getTransaction = function (options) {
    const transaction = realGetTransaction(options);
    ['raw', 'from'].map(fn => {
      const tmp = transaction[fn].bind(transaction)
      transaction[fn] = function () {
        if (mockUtils.timesQueryShouldFail[JSON.stringify(arguments)]) {
          mockUtils.timesQueryShouldFail[JSON.stringify(arguments)]--
          const err = new Error('Mock database error')
          err.code = '40001'
          if (fn === 'from') {
            return {
              select: () => {
                return {
                  where: () => {
                    return Promise.reject(err)
                  }
                }
              }
            }
          } else {
            return Promise.reject(err)
          }
        }
        // console.log('Mockable call to database', fn, arguments, mockUtils.timesQueryShouldFail)
        return tmp.apply(transaction, arguments)
      }
    })
    return transaction
  }
  return utils
}
mockUtils.timesQueryShouldFail = {}
mock('../../src/models/db/utils', mockUtils)
