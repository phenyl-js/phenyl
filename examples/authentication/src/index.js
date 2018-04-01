// @flow
/* eslint-disable no-console */
import http from 'http'
import PhenylHttpServer from 'phenyl-http-server/jsnext'
import PhenylRestApi from 'phenyl-rest-api/jsnext'
import PhenylHttpClient from 'phenyl-http-client/jsnext'
import { createEntityClient } from 'phenyl-memory-db/jsnext'
import { StandardUserDefinition } from 'phenyl-standards/jsnext'

const memoryClient = createEntityClient()

type PlainPatient = { id: string, name: string, email: string, password?: string }
type PatientAuthSetting = { credentials: { email: string, password: string }, options: Object }

type ThisTypeMap = {
  entities: {
    patient: PlainPatient
  },
  customQueries: {},
  customCommands: {},
  auths: {
    patient: PatientAuthSetting,
  },
}

class PatientDefinition extends StandardUserDefinition {
  constructor() {
    super({
      entityClient: memoryClient,
      accountPropName: 'email',
      passwordPropName: 'password',
      ttl: 24 * 3600
    })
  }
  async authorization(reqData, session): Promise<boolean> {
    if (['insert', 'insertAndGet', 'insertAndFetch', 'login', 'logout'].includes(reqData.method)) return true
    console.log(session, reqData.payload)
    // $FlowIssue(reqData.payload-has-id)
    if (['updateAndGet'].includes(reqData.method)) return session != null && session.userId === reqData.payload.id
    return false
  }
}

const functionalGroup = {
  customQueries: {},
  customCommands: {},
  users: {
    patient: new PatientDefinition()
  },
  nonUsers: {}
}

async function main() {
  const restApiHandler: PhenylRestApi<ThisTypeMap> = PhenylRestApi.createFromFunctionalGroup(functionalGroup, { client: memoryClient })

  const server = new PhenylHttpServer(http.createServer(), { restApiHandler })
  server.listen(8080)

  const client: PhenylHttpClient<ThisTypeMap> = new PhenylHttpClient({ url: 'http://localhost:8080' })

  const inserted = await client.insertAndGet({ entityName: 'patient', value: {
    name: 'Shin Suzuki',
    email: 'shinout@example.com',
    password: 'shin123',
  }})
  console.log(inserted)

  const logined = await client.login({
    entityName: 'patient',
    credentials: {
      email: 'shinout@example.com',
      password: 'shin123'
    }
  })
  console.log(logined)
  const updated = await client.updateAndGet({
    entityName: 'patient',
    id: inserted.entity.id,
    operation: { $set: { password: 'shin1234' } }
  }, logined.session.id)
  console.log(updated)
}

main().catch(e => console.log(e))
