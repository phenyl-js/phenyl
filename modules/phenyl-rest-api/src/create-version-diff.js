// @flow

import type {
  RequestData,
  ResponseData,
  VersionDiff,
  IdUpdateCommand,
  MultiUpdateCommand,
  CommandResult,
  GetCommandResult,
  PushCommand,
  PushCommandResult,
  MultiValuesCommandResult,
} from 'phenyl-interfaces'

/**
 *
 */
export function createVersionDiff(reqData: RequestData, resData: ResponseData): Array<VersionDiff> {
  if (resData.type === 'error') return []

  switch (reqData.method) {
    case 'update': {
      if (reqData.payload.id != null) {
        // $FlowIssue(reqData.payload-is-IdUpdateCommand)
        const payload: IdUpdateCommand = reqData.payload
        // $FlowIssue(resData.payload-is-CommandResult)
        const result: CommandResult = resData.payload
        const versionDiff = createVersionDiffByIdUpdateCommand(payload, result)
        return versionDiff ? [versionDiff] : []
      }
      else if (reqData.payload.where != null) {
        // $FlowIssue(reqData.payload-is-MultiUpdateCommand)
        const payload: MultiUpdateCommand = reqData.payload
        // $FlowIssue(resData.payload-is-MultiValuesCommandResult)
        const result: MultiValuesCommandResult = resData.payload
        // $FlowIssue(null-value-is-filtered)
        return createVersionDiffByMultiUpdateCommand(payload, result).filter(v => v != null)
      }
      return []
    }

    case 'updateAndGet': {
      // $FlowIssue(resData.payload-is-GetCommandREsult)
      const versionDiff = createVersionDiffByIdUpdateCommand(reqData.payload, resData.payload)
      return versionDiff ? [versionDiff] : []
    }

    case 'updateAndFetch': {
      // $FlowIssue(resData.payload-is-MultiValuesCommandResult)
      const result: MultiValuesCommandResult = resData.payload
      // $FlowIssue(null-value-is-filtered)
      return createVersionDiffByMultiUpdateCommand(reqData.payload, result).filter(v => v)
    }

    case 'push': {
      // $FlowIssue(resData.payload-is-PushCommandResult)
      const result: PushCommandResult = resData.payload
      const versionDiff = createVersionDiffByPushCommand(reqData.payload, result)
      return versionDiff ? [versionDiff] : []
    }
    default:
      return []
  }
}

function createVersionDiffByIdUpdateCommand(command: IdUpdateCommand, result: CommandResult | GetCommandResult): ?VersionDiff {
  const { versionId, prevVersionId } = result
  if (versionId && prevVersionId) {
    const { entityName, id, operation } = command
    return { entityName, id, operation, versionId, prevVersionId }
  }
  return null
}

function createVersionDiffByMultiUpdateCommand(command: MultiUpdateCommand, result: MultiValuesCommandResult): Array<?VersionDiff> {
  const { versionsById, prevVersionsById } = result
  if (!versionsById || !prevVersionsById) return []

  const { entityName, operation } = command
  // $FlowIssue(returns-non-null-value-with-filter(v => v))
  return Object.keys(versionsById).map(entityId => {
    const versionId = versionsById[entityId]
    const prevVersionId = prevVersionsById[entityId]
    if (versionId && prevVersionId) {
      return { entityName, id: entityId, operation, versionId, prevVersionId }
    }
    return null
  })
}

function createVersionDiffByPushCommand(command: PushCommand, result: PushCommandResult): ?VersionDiff {
  const { versionId, prevVersionId, newOperation } = result
  if (versionId && prevVersionId) {
    const { entityName, id } = command
    return { entityName, id, operation: newOperation, versionId, prevVersionId }
  }
  return null
}
