// @flow

import { retargetToProp, mergeOperations } from 'power-assign/jsnext'

import type {
  DeleteCommand,
  EntityState,
  EntityStateUpdater,
  IdUpdateCommand,
  IdDeleteCommand,
  MultiUpdateCommand,
  MultiDeleteCommand,
  Entity,
  UpdateOperation,
} from 'phenyl-interfaces'

import PhenylStateFinder from './phenyl-state-finder.js'

/**
 *
 */
export default class PhenylStateUpdater implements EntityStateUpdater {
  state: EntityState

  constructor(state: EntityState) {
    this.state = state
  }

  /**
   *
   */
  updateById(command: IdUpdateCommand): UpdateOperation {
    return this.constructor.updateById(this.state, command)
  }

  /**
   *
   */
  updateMulti(command: MultiUpdateCommand): UpdateOperation {
    return this.constructor.updateMulti(this.state, command)
  }

  /**
   * Register entities.
   * As RestorablePreEntities in InsertCommand does not have "id",
   * PhenylState cannot handle InsertCommand.
   * Instead, it receives in entities created in server.
   */
  register(entityName: string, ...entities: Array<Entity>): UpdateOperation {
    return this.constructor.register(this.state, entityName, ...entities)
  }

  /**
   *
   */
  delete(command: DeleteCommand): UpdateOperation {
    return this.constructor.delete(this.state, command)
  }

  /**
   *
   */
  deleteById(command: IdDeleteCommand): UpdateOperation {
    return this.constructor.deleteById(this.state, command)
  }

  /**
   *
   */
  deleteByFindOperation(command: MultiDeleteCommand): UpdateOperation {
    return this.constructor.deleteByFindOperation(this.state, command)
  }

  /**
   *
   */
  static updateById(
    state: EntityState,
    command: IdUpdateCommand
  ): UpdateOperation {
    const { id, entityName, operation } = command
    if (!PhenylStateFinder.has(state, { entityName, id })) {
      throw new Error('Could not find any entity to update.')
    }
    const docPath = ['pool', entityName, id].join('.')
    return retargetToProp(docPath, operation)
  }

  /**
   *
   */
  static updateMulti(
    state: EntityState,
    command: MultiUpdateCommand
  ): UpdateOperation {
    const { where, entityName, operation } = command

    const targetEntities = PhenylStateFinder.find(state, { entityName, where })
    const operationList = targetEntities.map(targetEntity => {
      const docPath = ['pool', entityName, targetEntity.id].join('.')
      return retargetToProp(docPath, operation)
    })
    return mergeOperations(...operationList)
  }

  /**
   * Register entities.
   * As RestorablePreEntities in InsertCommand does not have "id",
   * PhenylState cannot handle InsertCommand.
   * Instead, it receives in entities created in server.
   */
  static register(
    state: EntityState,
    entityName: string,
    ...entities: Array<Entity>
  ): UpdateOperation {
    const operationList = entities.map(entity => {
      const docPath = ['pool', entityName, entity.id].join('.')
      return { $set: { [docPath]: entity } }
    })
    return mergeOperations(...operationList)
  }

  /**
   *
   */
  static delete(state: EntityState, command: DeleteCommand): UpdateOperation {
    if (command.where) {
      return this.deleteByFindOperation(state, command)
    }
    return this.deleteById(state, command)
  }

  /**
   *
   */
  static deleteById(
    state: EntityState,
    command: IdDeleteCommand
  ): UpdateOperation {
    const { id, entityName } = command
    const docPath = ['pool', entityName, id].join('.')
    return { $unset: { [docPath]: '' } }
  }

  /**
   *
   */
  static deleteByFindOperation(
    state: EntityState,
    command: MultiDeleteCommand
  ): UpdateOperation {
    const { where, entityName } = command
    const targetEntities = PhenylStateFinder.find(state, { entityName, where })
    const $unset = {}
    targetEntities.forEach(targetEntity => {
      const docPath = ['pool', entityName, targetEntity.id].join('.')
      $unset[docPath] = ''
    })
    return { $unset }
  }
}
