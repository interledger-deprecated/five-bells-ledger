'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
const logger = require('../src/services/log')
const logHelper = require('./helpers/log')
const TimeQueue = require('../src/lib/timeQueue').TimeQueue

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('TimeQueue', function () {
  logHelper(logger)

  beforeEach(function () {
    this.timeQueue = new TimeQueue()
  })

  describe('.insert()', function () {
    it('should insert an item to the priority queue', async function () {
      const bananaItem = {'day-o': 'daaaay-o'}
      await this.timeQueue.insert(START_DATE, bananaItem)
      expect(this.timeQueue._queue.peek().item).to.deep.equal(bananaItem)
    })
    it('should emit an "insert" event when adding items', async function () {
      const insertListener = sinon.spy()
      this.timeQueue.on('insert', async function () {
        insertListener()
      })
      expect(this.timeQueue.listeners('insert')).to.have.length(1)
      expect(insertListener.called).to.equal(false)
      await this.timeQueue.insert(START_DATE, {})
      expect(insertListener.calledOnce).to.equal(true)
    })
  })

  describe('.getEarliestDate()', function () {
    it('should return the earliest item', async function () {
      const bananaItem1 = {'day-o': 'daaaay-o'}
      const bananaItem2 = {'daylight': 'come'}
      const bananaItem3 = {'and me': 'wanna go home'}
      await this.timeQueue.insert(START_DATE, bananaItem1)
      await this.timeQueue.insert(START_DATE + 100, bananaItem2)
      await this.timeQueue.insert(START_DATE + 100000, bananaItem3)
      expect(this.timeQueue.getEarliestDate()).to.equal(START_DATE)
    })
    it('should return the earliest item even when added out of order', async function () {
      const bananaItem1 = {'day-o': 'daaaay-o'}
      const bananaItem2 = {'daylight': 'come'}
      const bananaItem3 = {'and me': 'wanna go home'}
      await this.timeQueue.insert(START_DATE + 100000, bananaItem1)
      await this.timeQueue.insert(START_DATE, bananaItem2)
      await this.timeQueue.insert(START_DATE + 100, bananaItem3)
      expect(this.timeQueue.getEarliestDate()).to.equal(START_DATE)
    })
  })

  describe('.popBeforeDate()', function () {
    it('should return all items before the cutoff date', async function () {
      const bananaItem1 = {'day-o': 'daaaay-o'}
      const bananaItem2 = {'daylight': 'come'}
      const bananaItem3 = {'and me': 'wanna go home'}
      await this.timeQueue.insert(START_DATE + 100000, bananaItem1)
      await this.timeQueue.insert(START_DATE, bananaItem2)
      await this.timeQueue.insert(START_DATE + 100, bananaItem3)
      expect(this.timeQueue.popBeforeDate(START_DATE + 101)).to.deep.equal([
        bananaItem2,
        bananaItem3
      ])
    })
    it('or no items at all if there are none', async function () {
      const bananaItem1 = {'day-o': 'daaaay-o'}
      const bananaItem2 = {'daylight': 'come'}
      const bananaItem3 = {'and me': 'wanna go home'}
      await this.timeQueue.insert(START_DATE + 100000, bananaItem1)
      await this.timeQueue.insert(START_DATE, bananaItem2)
      await this.timeQueue.insert(START_DATE + 100, bananaItem3)
      expect(this.timeQueue.popBeforeDate(START_DATE - 1)).to.deep.equal([])
    })
  })

  describe('.includes()', function () {
    it('should find an included item', async function () {
      const bananaItem1 = {'day-o': 'daaaay-o'}
      const bananaItem2 = {'daylight': 'come'}
      const bananaItem3 = {'and me': 'wanna go home'}
      await this.timeQueue.insert(START_DATE + 100000, bananaItem1)
      await this.timeQueue.insert(START_DATE, bananaItem2)
      await this.timeQueue.insert(START_DATE + 100, bananaItem3)
      expect(this.timeQueue.includes(bananaItem1)).to.equal(true)
      expect(this.timeQueue.includes(bananaItem2)).to.equal(true)
      expect(this.timeQueue.includes(bananaItem3)).to.equal(true)
    })
    it('should not find a non-included item', async function () {
      const bananaItem1 = {'day-o': 'daaaay-o'}
      const bananaItem2 = {'daylight': 'come'}
      const bananaItem3 = {'and me': 'wanna go home'}
      await this.timeQueue.insert(START_DATE + 100000, bananaItem1)
      await this.timeQueue.insert(START_DATE, bananaItem2)
      expect(this.timeQueue.includes(bananaItem1)).to.equal(true)
      expect(this.timeQueue.includes(bananaItem2)).to.equal(true)
      expect(this.timeQueue.includes(bananaItem3)).to.equal(false)
    })
  })

  describe('.remove()', function () {
    it('should remove an included item', async function () {
      const bananaItem1 = {'day-o': 'daaaay-o'}
      const bananaItem2 = {'daylight': 'come'}
      const bananaItem3 = {'and me': 'wanna go home'}
      await this.timeQueue.insert(START_DATE + 100000, bananaItem1)
      await this.timeQueue.insert(START_DATE, bananaItem2)
      await this.timeQueue.insert(START_DATE + 100, bananaItem3)
      expect(this.timeQueue.includes(bananaItem1)).to.equal(true)
      expect(this.timeQueue.includes(bananaItem2)).to.equal(true)
      expect(this.timeQueue.includes(bananaItem3)).to.equal(true)
      this.timeQueue.remove(bananaItem2)
      expect(this.timeQueue.includes(bananaItem1)).to.equal(true)
      expect(this.timeQueue.includes(bananaItem2)).to.equal(false)
      expect(this.timeQueue.includes(bananaItem3)).to.equal(true)
    })
  })
})
