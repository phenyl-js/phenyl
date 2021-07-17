# @phenyl/memory-db

volatile memory DB for local mocking

## usage

```js
import { createEntityClient } from '@phenyl/memory-db'

const entityClient = createEntityClient()

const user1 = {
    id: 'user1',
    name: 'user1'
}

entityClient.insertOne({
    entityName: 'user',
    value: user1
})

const { entity: user } = entityClient.get({
    entityName: 'user',
    id: 'user1'
})
```

## Installation
```sh
npm install @phenyl/memory-db
```

## API Documentation

- createEntityClient
- createPhenylClients

### createEntityClient

Create Entity Client with memory db.

```ts
const entityClient = createEntityClient()
```

### createPhenylClients

Create Entity Client and Session Client with memory db.

```ts
const { entityClient, sessionClient } = createPhenylClients()
```
