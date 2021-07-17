# @phenyl/mongodb

MongoDB client.

## usage
See [here](../rest-api/README.md) if you use phenylMongoDbClient on your server.

```js
import { PhenylMongoDbClient, connect } from "@phenyl/mongodb"

const connection = await connect({
  url: "mongodb://localhost:27017",
  dbname: "mydb",
});

const phenylMongoDbClient = new PhenylMongoDbClient(connection)

await phenylMongoDbClient.insertAndGet({ entityName: "user", value: { id: "user" } })
const { entity: user } = phenylMongoDbClient.get({ entityName: "user", id: "user" })
```

## API Documentation

- createEntityClient
- createPhenylClients

### createEntityClient

Create Entity Client with mongodb.

```ts
const entityClient = createEntityClient()
```

### createPhenylClients

Create Entity Client and Session Client with mongodb.

```ts
const { entityClient, sessionClient } = createPhenylClients()
```
