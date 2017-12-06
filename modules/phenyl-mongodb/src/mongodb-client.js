// @flow
import { createServerError } from 'phenyl-utils/jsnext'
import { assign } from 'power-assign/jsnext'
import {
  convertToDotNotationString,
  visitFindOperation,
} from 'oad-utils/jsnext'

import type {
  Entity,
  DbClient,
  IdQuery,
  IdsQuery,
  WhereQuery,
  SingleInsertCommand,
  MultiInsertCommand,
  IdUpdateCommand,
  MultiUpdateCommand,
  DeleteCommand,
  FindOperation,
  UpdateOperation,
  SimpleFindOperation,
} from 'phenyl-interfaces'

import type { MongoDbConnection } from './connection.js'

function setIdTo_idInWhere(
  // $FlowIssue(this-is-SimpleFindOperation)
  simpleFindOperation: SimpleFindOperation
): SimpleFindOperation {
  return assign(simpleFindOperation, { $rename: { id: '_id' } })
}

function convertDocumentPathToDotNotation(
  simpleFindOperation: SimpleFindOperation
): SimpleFindOperation {
  return Object.keys(simpleFindOperation).reduce((operation, srcKey) => {
    const dstKey = convertToDotNotationString(srcKey)
    operation[dstKey] = simpleFindOperation[srcKey]
    return operation
  }, {})
}

function composedFinedOperationFilters(
  simpleFindOperation: SimpleFindOperation
): SimpleFindOperation {
  return [
    setIdTo_idInWhere,
    convertDocumentPathToDotNotation, // execute last because power-assign required documentPath
  ].reduce(
    (operation, filterFunc) => filterFunc(operation),
    simpleFindOperation
  )
}

export function filterFindOperation(operation: FindOperation): FindOperation {
  return visitFindOperation(operation, {
    simpleFindOperation: composedFinedOperationFilters,
  })
}

function convertNewNameWithParent(operation: UpdateOperation): UpdateOperation {
  const renameOperator = operation.$rename
  if (!renameOperator) return operation

  const renameOperatorWithParent = Object.keys(renameOperator).reduce(
    (operator, key) => {
      operator[key] = key
        .split('.')
        .slice(0, -1)
        .concat(renameOperator[key])
        .join('.')
      return operator
    },
    {}
  )

  return assign(operation, { $set: { $rename: renameOperatorWithParent } })
}

export function filterUpdateOperation(
  operation: UpdateOperation
): UpdateOperation {
  return convertNewNameWithParent(operation)
}

function setIdTo_idInEntity(entity: Entity): Entity {
  return assign(entity, { $rename: { id: '_id' } })
}

function set_idToIdInEntity(entity: Entity): Entity {
  return assign(entity, { $rename: { _id: 'id' } })
}

export class PhenylMongoDbClient implements DbClient {
  conn: MongoDbConnection

  constructor(conn: MongoDbConnection) {
    this.conn = conn
  }

  async find(query: WhereQuery): Promise<Array<Entity>> {
    const { entityName, where, skip, limit } = query
    const coll = this.conn.collection(entityName)
    const options = {}
    if (skip) options.skip = skip
    if (limit) options.limit = limit

    const result = await coll.find(filterFindOperation(where), options)
    return result.map(set_idToIdInEntity)
  }

  async findOne(query: WhereQuery): Promise<Entity> {
    const { entityName, where } = query
    const coll = this.conn.collection(entityName)
    const result = await coll.find(filterFindOperation(where), { limit: 1 })
    if (result.length === 0) {
      throw createServerError('findOne()', 'NotFound')
    }
    return set_idToIdInEntity(result[0] || null)
  }

  async get(query: IdQuery): Promise<Entity> {
    const { entityName, id } = query
    const coll = this.conn.collection(entityName)
    const result = await coll.find({ _id: id })
    if (result.length === 0) {
      throw createServerError(
        '"PhenylMongodbClient#get()" failed. Could not find any entity with the given query.',
        'NotFound'
      )
    }
    return set_idToIdInEntity(result[0])
  }

  async getByIds(query: IdsQuery): Promise<Array<Entity>> {
    const { entityName, ids } = query
    const coll = this.conn.collection(entityName)
    const result = await coll.find({ _id: { $in: ids } })
    if (result.length === 0) {
      throw createServerError(
        '"PhenylMongodbClient#getByIds()" failed. Could not find any entity with the given query.',
        'NotFound'
      )
    }
    return result.map(set_idToIdInEntity)
  }

  async insertOne(command: SingleInsertCommand): Promise<number> {
    const { entityName, value } = command
    const coll = this.conn.collection(entityName)
    const result = await coll.insertOne(setIdTo_idInEntity(value))
    return result.insertedCount
  }

  async insertMulti(command: MultiInsertCommand): Promise<number> {
    const { entityName } = command
    const coll = this.conn.collection(entityName)
    const result = await coll.insertMany(command.values.map(setIdTo_idInEntity))
    return result.insertedCount
  }

  async insertAndGet(command: SingleInsertCommand): Promise<Entity> {
    const { entityName } = command
    const coll = this.conn.collection(entityName)
    const result = await coll.insertOne(setIdTo_idInEntity(command.value))
    // TODO transactional operation needed
    return this.get({ entityName, id: result.insertedId })
  }

  async insertAndGetMulti(command: MultiInsertCommand): Promise<Array<Entity>> {
    const { entityName } = command
    const coll = this.conn.collection(entityName)

    const result = await coll.insertMany(command.values.map(setIdTo_idInEntity))
    // TODO: transactional operation needed
    return this.getByIds({ entityName, ids: result.insertedIds })
  }

  async updateAndGet(command: IdUpdateCommand): Promise<Entity> {
    const { entityName, id, operation } = command
    const coll = this.conn.collection(entityName)
    const result = await coll.updateOne(
      { _id: id },
      filterUpdateOperation(operation)
    )
    const { matchedCount } = result
    if (matchedCount === 0) {
      throw createServerError(
        '"PhenylMongodbClient#updateAndGet()" failed. Could not find any entity with the given query.',
        'NotFound'
      )
    }
    // TODO: transactional operation needed
    return this.get({ entityName, id })
  }

  async updateAndFetch(command: MultiUpdateCommand): Promise<Array<Entity>> {
    const { entityName, where, operation } = command
    const coll = this.conn.collection(entityName)
    await coll.updateMany(
      filterFindOperation(where),
      filterUpdateOperation(operation)
    )
    // FIXME: the result may be different from updated entities.
    return this.find({ entityName, where: setIdTo_idInWhere(where) })
  }

  async delete(command: DeleteCommand): Promise<number> {
    const { entityName } = command
    const coll = this.conn.collection(entityName)
    let result
    if (command.id) {
      result = await coll.deleteOne({ _id: command.id })
    } else if (command.where) {
      result = await coll.deleteMany(setIdTo_idInWhere(command.where))
    }
    // $FlowIssue(deleteCount-exists)
    const { deletedCount } = result
    return deletedCount
  }
}
