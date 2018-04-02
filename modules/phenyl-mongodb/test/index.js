// @flow
/* eslint-disable no-console */

import kocha, { after, before, describe, it } from 'kocha'
import { createEntityClient } from '../src/create-entity-client.js'
import assert from 'power-assert'
import bson from 'bson'
import { connect } from '../src/connection.js'
import { assertEntityClient } from 'phenyl-interfaces/test-cases'
import type { MongoDbConnection } from '../src/connection.js'

const url = 'mongodb://localhost:27017'

async function createMongoDBClient() {
  try {
    const mongoDBConnection = await connect(url, 'phenyl-mongodb-test')
    return createEntityClient(mongoDBConnection)
  }
  catch (e) {
    console.log(e.message)
    throw new Error('Test was skipped as connection to mongodb failed.')
  }
}

assertEntityClient(createMongoDBClient(), kocha, assert)

describe('mongoDBEntityClient', () => {

  let conn: MongoDbConnection
  let entityClient

  const HEX_24_ID = '000000000123456789abcdef'
  let generatedId

  before(async () => {
    conn = await connect(url, 'phenyl-mongodb-test')
    entityClient = createEntityClient(conn)
  })

  after(async () => {
    entityClient.delete({ entityName: 'user', where: {} })
  })

  describe('inserts entity', () => {
    it('without id and generates { _id: ObjectId(xxx) } ', async () => {
      const result = await entityClient.insertAndGet({
        entityName: 'user',
        value: { name: 'Jone' },
      })

      assert(result.entity.id)

      const users = await conn.collection('user').find()
      assert.deepEqual(users[0]._id, bson.ObjectID(result.entity.id))

      generatedId = result.entity.id
    })

    describe('with id after coverts from id', () => {
      it('to _id', async () => {
        await entityClient.insertOne({
          entityName: 'user',
          value: { id: 'jane', name: 'Jane' },
        })

        const users = await conn.collection('user').find({_id: 'jane'})
        assert(users[0]._id === 'jane')
      })

      it('to { _id: ObjectId(xxx) } if id is 24-byte hex lower string', async () => {
        const result = await entityClient.insertAndGet({
          entityName: 'user',
          value: { id: HEX_24_ID, name: 'Jesse' },
        })

        assert(result.entity.id === HEX_24_ID)

        const users = await conn.collection('user').find({ name: 'Jesse' })
        assert.deepEqual(users[0]._id, bson.ObjectID(HEX_24_ID))
      })
    })
  })

  describe('gets entity', () => {
    it('by auto generated id', async () => {
      const result = await entityClient.get({
        entityName: 'user',
        id: generatedId,
      })

      assert(result.entity.name === 'Jone')
    })

    it('by set id', async () => {
      const result = await entityClient.get({
        entityName: 'user',
        id: 'jane',
      })

      assert(result.entity.name === 'Jane')
    })

    it('by set 24-byte hex string id', async () => {
      const result = await entityClient.get({
        entityName: 'user',
        id: HEX_24_ID,
      })

      assert(result.entity.name === 'Jesse')
    })
  })

  describe('[Unstable because of the mongodb client library] ChangeStream', () => {
    it('next', async (done) => {
      const stream = entityClient.dbClient.watch('user')
      stream.next((err, evt) => {
        if (evt.operationType === 'update') {
          assert(evt.updateDescription.removedFields.length === 1)
          assert(evt.updateDescription.updatedFields['shin.a123'] === 'out')
          done()
        }
        else {
          done(`Operation type is invalid. ${evt.operationType} is given.`)
        }
      })

      await entityClient.updateAndGet({
        entityName: 'user',
        id: HEX_24_ID,
        operation: { $set: { 'shin.a123': 'out' }, $unset: { name: '' } }
      })
    })
  })
})
