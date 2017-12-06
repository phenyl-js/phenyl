// @flow

import { assign } from 'power-assign/jsnext'

import { createLocalError } from 'phenyl-utils/jsnext'

import { removeOne } from './utils'

import type {
  ActionTag,
  Id,
  IdUpdateCommand,
  Entity,
  LocalState,
  PhenylError,
  PushCommand,
  Session,
  UpdateOperation,
  VersionDiff,
} from 'phenyl-interfaces'

import { LocalStateFinder } from './local-state-finder.js'

/**
 *
 */
export class LocalStateUpdater {
  /**
   * Commit the operation of entity to LocalState.
   * Error is thrown when no entity is registered.
   */
  static commit(state: LocalState, command: IdUpdateCommand): UpdateOperation {
    const { entityName, id, operation } = command

    if (!LocalStateFinder.hasEntity(state, { entityName, id })) {
      throw new Error(
        `LocalStateUpdater.commit(). No entity found. entityName: "${
          entityName
        }", id: "${id}".`
      )
    }
    const entity = LocalStateFinder.getHeadEntity(state, { id, entityName })
    const newEntity = assign(entity, operation)
    return {
      $push: {
        [`entities.${entityName}.${id}.commits`]: operation,
      },
      $set: {
        [`entities.${entityName}.${id}.head`]: newEntity,
      },
    }
  }

  /**
   * Revert the already applied commit.
   * Error is thrown when no entity is registered.
   */
  static revert(state: LocalState, command: IdUpdateCommand): UpdateOperation {
    const { entityName, id, operation } = command

    if (!LocalStateFinder.hasEntity(state, { entityName, id })) {
      throw new Error(
        `LocalStateUpdater.revert(). No entity found. entityName: "${
          entityName
        }", id: "${id}".`
      )
    }
    const entityInfo = LocalStateFinder.getEntityInfo(state, { id, entityName })
    const commits = removeOne(entityInfo.commits, operation)
    const restoredHead = assign(entityInfo.origin, ...commits)
    return {
      $set: {
        [`entities.${entityName}.${id}.commits`]: commits,
        [`entities.${entityName}.${id}.head`]: restoredHead,
      },
    }
  }

  /**
   * Register the entity info into LocalState.
   * Overwrite if already exists.
   */
  static follow(
    state: LocalState,
    entityName: string,
    entity: Entity,
    versionId: Id
  ): UpdateOperation {
    return {
      $set: {
        [`entities.${entityName}.${entity.id}`]: {
          origin: entity,
          versionId,
          commits: [],
          head: null,
        },
      },
    }
  }

  /**
   * Remove the entity info from LocalState.
   */
  static unfollow(
    state: LocalState,
    entityName: string,
    id: Id
  ): UpdateOperation {
    return {
      $unset: {
        [`entities.${entityName}.${id}`]: '',
      },
    }
  }

  /**
   * Push network request promise.
   */
  static networkRequest(state: LocalState, tag: ActionTag): UpdateOperation {
    return {
      $push: { 'network.requests': tag },
    }
  }

  /**
   * Remove network request promise from the request queue.
   */
  static removeNetworkRequest(
    state: LocalState,
    tag: ActionTag
  ): UpdateOperation {
    return {
      $set: { 'network.requests': removeOne(state.network.requests, tag) },
    }
  }

  /**
   * Apply the given VersionDiff as a patch.
   * If the diff's prevVersionId isn't equal to registered versionId, no operation is returned.
   * If it equals, applied to origin.
   */
  static patch(state: LocalState, versionDiff: VersionDiff): UpdateOperation {
    const { entityName, id, versionId, prevVersionId, operation } = versionDiff
    const entityInfo = LocalStateFinder.getEntityInfo(state, { id, entityName })

    // Not applicable diff.
    if (entityInfo.versionId !== prevVersionId) {
      return {}
    }

    const newOrigin = assign(entityInfo.origin, operation)
    const newHead = assign(newOrigin, ...entityInfo.commits)
    return {
      $set: {
        [`entities.${entityName}.${id}.origin`]: newOrigin,
        [`entities.${entityName}.${id}.versionId`]: versionId,
        [`entities.${entityName}.${id}.head`]: newHead,
      },
    }
  }

  /**
   * Apply the master commits.
   * If local commits exist, apply them after master commits.
   */
  static rebase(state: LocalState, pushCommand: PushCommand): UpdateOperation {
    const { entityName, id, versionId, operations } = pushCommand
    const entityInfo = LocalStateFinder.getEntityInfo(state, { id, entityName })

    const newOrigin = assign(entityInfo.origin, ...operations)
    const newHead = assign(newOrigin, ...entityInfo.commits)

    return {
      $set: {
        [`entities.${entityName}.${id}.origin`]: newOrigin,
        [`entities.${entityName}.${id}.versionId`]: versionId,
        [`entities.${entityName}.${id}.head`]: newHead,
      },
    }
  }

  /**
   * Apply the master commits, then apply the given local commits.
   */
  static synchronize(
    state: LocalState,
    pushCommand: PushCommand,
    localCommits: Array<UpdateOperation>
  ): UpdateOperation {
    const { entityName, id, operations, versionId } = pushCommand
    const entityInfo = LocalStateFinder.getEntityInfo(state, { id, entityName })

    const newOrigin = assign(entityInfo.origin, ...operations, ...localCommits)
    // assert(localCommits.length === 0 || entityInfo.commits[0] === localCommits[0])
    const newCommits = entityInfo.commits.slice(localCommits.length)
    const newHead =
      newCommits.length > 0 ? assign(newOrigin, ...newCommits) : null

    return {
      $set: {
        [`entities.${entityName}.${id}`]: {
          origin: newOrigin,
          versionId,
          commits: newCommits,
          head: newHead,
        },
      },
    }
  }

  /**
   * Register all the entities into LocalState.
   * NOTICE: if returned type of this.follow() changes, this implementation must be changed.
   */
  static followAll(
    state: LocalState,
    entityName: string,
    entities: Array<Entity>,
    versionsById: { [entityId: Id]: Id }
  ): UpdateOperation {
    const $setOp = {}
    for (const entity of entities) {
      const versionId = versionsById[entity.id]
      if (versionId == null)
        throw new Error(
          `LocalStateUpdater.followAll(): No versionId was passed to the entityName: "${
            entityName
          }", id: "${entity.id}".`
        )
      const operation = this.follow(state, entityName, entity, versionId)
      Object.assign($setOp, operation.$set)
    }
    return { $set: $setOp }
  }

  /**
   * Set session.
   */
  static setSession(
    state: LocalState,
    session: Session,
    user: ?Entity,
    versionId?: ?Id
  ): UpdateOperation {
    const { entityName } = session
    const operation = {
      $set: { session },
    }
    if (user != null && versionId != null) {
      const followOp = this.follow(state, entityName, user, versionId)
      Object.assign(operation.$set, followOp.$set)
    }
    return operation
  }

  /**
   * Remove session.
   */
  static unsetSession(): UpdateOperation {
    return { $unset: { session: '' } }
  }

  /**
   * Set Error.
   */
  static error(e: Error | PhenylError, actionTag: ActionTag): UpdateOperation {
    const err = e.type && e.at ? e : createLocalError(e)
    return {
      $set: {
        error: {
          // $FlowIssue(err.type-exists)
          type: err.type,
          // $FlowIssue(err.at-exists)
          at: err.at,
          message: err.message,
          actionTag,
        },
      },
    }
  }

  /**
   * Set network state Online.
   */
  static online(): UpdateOperation {
    return {
      $set: { 'network.isOnline': true },
    }
  }

  /**
   * Set network state Offline.
   */
  static offline(): UpdateOperation {
    return {
      $set: { 'network.isOnline': false },
    }
  }
}
