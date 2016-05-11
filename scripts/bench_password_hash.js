'use strict'

/**
 * Benchmark for password hashing with varying number of iterations.
 *
 * Useful for deciding the number of iterations, depending on the desired
 * latency vs security trade-off.
 *
 * To use, please run `npm install do-you-even-bench` and then
 * `node scripts/bench_password_hash.js`.
 */
require('do-you-even-bench')([
  {
    name: 'pbkdf2-100000',
    fn: () => {
      const crypto = require('crypto')
      crypto.pbkdf2Sync('test', 'test', 100000, 512, 'sha512')
    }
  },
  {
    name: 'pbkdf2-10000',
    fn: () => {
      const crypto = require('crypto')
      crypto.pbkdf2Sync('test', 'test', 10000, 512, 'sha512')
    }
  },
  {
    name: 'pbkdf2-1000',
    fn: () => {
      const crypto = require('crypto')
      crypto.pbkdf2Sync('test', 'test', 1000, 512, 'sha512')
    }
  },
  {
    name: 'pbkdf2-100',
    fn: () => {
      const crypto = require('crypto')
      crypto.pbkdf2Sync('test', 'test', 100, 512, 'sha512')
    }
  }
  // {
  //   name: 'bcrypt-10',
  //   fn: () => {
  //     const bcrypt = require('bcrypt')
  //     const salt = bcrypt.genSaltSync(10)
  //     bcrypt.hashSync('test', salt)
  //   }
  // }
])
