// @flow

import type { Middleware } from 'redux'
import { PhenylReduxModule } from './phenyl-redux-module.js'
import { LocalStateUpdater } from './local-state-updater.js'
import { LocalStateFinder } from './local-state-finder.js'

import type {
  AuthCommandMapOf,
  CommitAndPushAction,
  DeleteAction,
  EntityMapOf,
  EntityNameOf,
  EntityOf,
  FollowAction,
  FollowAllAction,
  Id,
  LocalState,
  LoginAction,
  LogoutAction,
  PatchAction,
  PhenylAction,
  PushAndCommitAction,
  PushCommand,
  PullAction,
  RestApiClient,
  SetSessionAction,
  TypeMap,
  UnfollowAction,
  UpdateOperation,
  UserEntityNameOf,
} from 'phenyl-interfaces'

export type PhenylActionOf<TM: TypeMap> = PhenylAction<EntityMapOf<TM>, AuthCommandMapOf<TM>>
export type LocalStateOf<TM: TypeMap> = LocalState<EntityMapOf<TM>>

export type MiddlewareOptions<TM: TypeMap> = {
  client: RestApiClient<TM>,
  storeKey?: string
}

export type Next<TM: TypeMap, T> = (action: PhenylActionOf<TM>) => Promise<T>

export class MiddlewareCreator<TM: TypeMap> {

  static create<T, S>(options: MiddlewareOptions<TM>): Middleware<S, PhenylActionOf<TM>, Next<TM, T>> {
    const storeKey = options.storeKey || 'phenyl'
    return (store: any) => (next: Next<TM, T>) => {
      const client = options.client
      const getState = () => store.getState()[storeKey]
      const handler: MiddlewareHandler<TM, T> = new MiddlewareHandler(getState, client, next)

      return (action: PhenylActionOf<TM>): Promise<T> => {
        switch (action.type) {
          case 'phenyl/commitAndPush':
            return handler.commitAndPush(action)
          case 'phenyl/delete':
            return handler.delete(action)
          case 'phenyl/follow':
            return handler.follow(action)
          case 'phenyl/followAll':
            return handler.followAll(action)
          case 'phenyl/login':
            return handler.login(action)
          case 'phenyl/logout':
            return handler.logout(action)
          case 'phenyl/patch':
            return handler.patch(action)
          case 'phenyl/pull':
            return handler.pull(action)
          case 'phenyl/pushAndCommit':
            return handler.pushAndCommit(action)
          case 'phenyl/setSession':
            return handler.setSession(action)
          case 'phenyl/unfollow':
            return handler.unfollow(action)
          case 'phenyl/unsetSession':
            return handler.unsetSession()
          default:
            return next(action)
        }
      }
    }
  }
}

/**
 *
 */
export class MiddlewareHandler<TM: TypeMap, T> {
  static LocalStateUpdater: Class<LocalStateUpdater<TM>> = LocalStateUpdater
  static PhenylReduxModule: Class<PhenylReduxModule<TM>> = PhenylReduxModule

  getState: () => LocalStateOf<TM>
  client: RestApiClient<TM>
  next: Next<TM, T>

  constructor(getState: () => LocalStateOf<TM>, client: RestApiClient<TM>, next: Next<TM, T>) {
    this.getState = getState
    this.client = client
    this.next = next
  }

  /**
   *
   */
  get state(): LocalStateOf<TM> {
    return this.getState()
  }

  /**
   * Invoke reducer 1: Assign operation(s) to state.
   */
  async assignToState(...ops: Array<UpdateOperation>): Promise<T> {
    const { PhenylReduxModule } = this.constructor
    return this.next(PhenylReduxModule.assign(ops))
  }

  /**
   * Invoke reducer 2: Reset state.
   */
  async resetState(): Promise<T> {
    const { PhenylReduxModule } = this.constructor
    return this.next(PhenylReduxModule.reset())
  }

  /**
   *
   */
  get sessionId(): ?Id {
    const { session } = this.state
    return session ? session.id : null
  }

  /**
   * Commit to LocalState and then Push to the CentralState.
   * If failed, the commit is still applied.
   * In such cases, pull the entity first.
   * Only when Authorization Error occurred, it will be rollbacked.
   */
  async commitAndPush<N: EntityNameOf<TM>>(action: CommitAndPushAction<N>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const { id, entityName } = action.payload

    this.assignToState(
      LocalStateUpdater.commit(this.state, action.payload),
      LocalStateUpdater.networkRequest(this.state, action.tag)
    )

    const { versionId, commits } = LocalStateFinder.getEntityInfo(this.state, { entityName, id })
    const pushCommand: PushCommand<N> = { id, operations: commits, entityName, versionId }

    const ops = []
    try {
      const result = await this.client.push(pushCommand, this.sessionId)
      if (result.hasEntity) {
        ops.push(LocalStateUpdater.follow(this.state, entityName, result.entity, result.versionId))
      }
      else {
        ops.push(
          LocalStateUpdater.synchronize(this.state, { entityName, id, operations: result.operations, versionId: result.versionId }, commits),
        )
      }
    }
    catch (e) {
      ops.push(LocalStateUpdater.error(e, action.tag))
      switch (e.type) {
        case 'Authorization': {
          ops.push(LocalStateUpdater.revert(this.state, action.payload))
          break
        }
        case 'NetworkFailed': {
          ops.push(LocalStateUpdater.offline())
          break
        }
        default: {
          break
        }
      }
    }
    finally {
      ops.push(LocalStateUpdater.removeNetworkRequest(this.state, action.tag))
    }
    return this.assignToState(...ops)
  }

  /**
   * Delete the entity in the CentralState, then unfollow the entity in LocalState.
   */
  async delete<N: EntityNameOf<TM>>(action: DeleteAction<N>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const { entityName, id } = action.payload
    this.assignToState(LocalStateUpdater.networkRequest(this.state, action.tag))

    const ops = []
    try {
      await this.client.delete(action.payload)
      ops.push(LocalStateUpdater.unfollow(this.state, entityName, id))
    }
    catch (e) {
      ops.push(LocalStateUpdater.error(e, action.tag))
    }
    finally {
      ops.push(LocalStateUpdater.removeNetworkRequest(this.state, action.tag))
    }
    return this.assignToState(...ops)
  }

  /**
   * Register the given entity.
   */
  async follow<N: EntityNameOf<TM>>(action: FollowAction<N, EntityOf<TM, N>>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const { entityName, entity, versionId } = action.payload
    return this.assignToState(LocalStateUpdater.follow(this.state, entityName, entity, versionId))
  }

  /**
   * Register all the given entities.
   */
  async followAll<N: EntityNameOf<TM>>(action: FollowAllAction<N, EntityOf<TM, N>>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const { entityName, entities, versionsById } = action.payload
    return this.assignToState(LocalStateUpdater.followAll(this.state, entityName, entities, versionsById))
  }

  /**
   * Login with credentials, then register the user.
   */
  async login<N: UserEntityNameOf<TM>>(action: LoginAction<N, AuthCommandMapOf<TM>>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const command = action.payload

    await this.assignToState(LocalStateUpdater.networkRequest(this.state, action.tag))

    let ops = []
    try {
      const result = await this.client.login(command, this.sessionId)
      ops.push(LocalStateUpdater.setSession(this.state, result.session, result.user, result.versionId))
    }
    catch (e) {
      ops.push(LocalStateUpdater.error(e, action.tag))
    }
    finally {
      ops.push(LocalStateUpdater.removeNetworkRequest(this.state, action.tag))
    }
    return this.assignToState(...ops)
  }

  /**
   * Remove the session in CentralState and reset the LocalState.
   */
  async logout<N: UserEntityNameOf<TM>>(action: LogoutAction<N>): Promise<T> {
    const command = action.payload
    await this.client.logout(command, this.sessionId)
    return this.resetState()
  }

  /**
   * Apply the VersionDiff.
   */
  async patch(action: PatchAction): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const versionDiff = action.payload
    return this.assignToState(LocalStateUpdater.patch(this.state, versionDiff))
  }

  /**
   * Push to the CentralState, then commit to LocalState.
   * If push failed, the commit is not applied.
   */
  async pushAndCommit<N: EntityNameOf<TM>>(action: PushAndCommitAction<N>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    await this.assignToState(LocalStateUpdater.networkRequest(this.state, action.tag))
    //LocalStateUpdater.commit(this.state, action.payload),

    const { operation, id, entityName } = action.payload
    const { versionId, commits } = LocalStateFinder.getEntityInfo(this.state, { entityName, id })
    const operations = commits.slice()
    operations.push(operation)
    const pushCommand: PushCommand<N> = { id, operations, entityName, versionId }

    const ops = []
    try {
      const result = await this.client.push(pushCommand, this.sessionId)
      if (result.hasEntity) {
        ops.push(LocalStateUpdater.follow(this.state, entityName, result.entity, result.versionId))
      }
      else {
        ops.push(LocalStateUpdater.synchronize(this.state, { entityName, id, operations: result.operations, versionId: result.versionId }, operations))
      }
    }
    catch (e) {
      ops.push(LocalStateUpdater.error(e, action.tag))
    }
    finally {
      ops.push(LocalStateUpdater.removeNetworkRequest(this.state, action.tag))
    }
    return this.assignToState(...ops)
  }

  /**
   * Pull the differences from CentralState, then rebase the diffs.
   */
  async pull<N: EntityNameOf<TM>>(action: PullAction<N>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const { id, entityName } = action.payload
    const { versionId } = LocalStateFinder.getEntityInfo(this.state, action.payload)
    const pullQuery = { id, entityName, versionId }
    const result = await this.client.pull(pullQuery, this.sessionId)

    const ops = []
    if (result.pulled) {
      ops.push(LocalStateUpdater.rebase(this.state, { entityName, id, operations: result.operations, versionId: result.versionId }))
    }
    else {
      ops.push(LocalStateUpdater.follow(this.state, entityName, result.entity, result.versionId))
    }
    return this.assignToState(...ops)
  }

  /**
   * Set session info. Register user if exists.
   */
  async setSession(action: SetSessionAction): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const { user, versionId, session } = action.payload
    return this.assignToState(LocalStateUpdater.setSession(this.state, session, user, versionId))
  }

  /**
   * Unregister the entity.
   */
  async unfollow<N: EntityNameOf<TM>>(action: UnfollowAction<N>): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    const { entityName, id } = action.payload
    return this.assignToState(LocalStateUpdater.unfollow(this.state, entityName, id))
  }

  /**
   * Unset session info. It doesn't remove the user info.
   */
  async unsetSession(): Promise<T> {
    const { LocalStateUpdater } = this.constructor
    return this.assignToState(LocalStateUpdater.unsetSession())
  }
}

const MC: Class<MiddlewareCreator<*>> = MiddlewareCreator
export const createMiddleware = MC.create
