# phenyl/standards

Standards has templates for user definition.

## example
You can define authentication and authorization by extending StandardUserDefinition.
See [here](../rest-api/README.md) for how to create a PhenylRestApi instance using the userDefinition.

```js
import { StandardUserDefinition } from "@phenyl/standards";
import { EntityDefinition } from "@phenyl/interfaces";

class UserDefinition extends StandardUserDefinition {
  constructor(entityClient) {
    super({
      entityClient,
      accountPropName: "email",
      passwordPropName: "password",
      ttl: 1000 * 60 * 60,
    });
  }
}

class NonUserDefinition implements EntityDefinition {
  constructor(entityClient) {
    super({ entityClient });
  }

  async authorize(reqData) {
    const { authType } = reqData.payload;

    if (authType !== "user") {
      return false;
    }

    switch (reqData.method) {
      case "find": {
        if (authType === "user") {
          return true;
        }
        return false;
      }
      default: {
        return false;
      }
    }
  }
}
```

## API Documentation

- encryptPasswordInRequestData
- removePasswordFromResponseData
- createCustomPathModifiers
- [deprecated] StandardEntityDefinition
- StandardUserDefinition
- ForeignQueryWrapper


### encryptPasswordInRequestData

Encrypt password in request data.

```ts
const encrypted = encryptPasswordInRequestData(
  reqData: GeneralUserEntityRequestData,
  passwordPropName: DocumentPath,
  encrypt: EncryptFunction
)
```

### removePasswordFromResponseData

Remove password from response data.

```ts
const removed = removePasswordFromResponseData(
  resData: GeneralUserEntityResponseData,
  passwordPropName: string
)
```

### createCustomPathModifiers

Create Path Modifiers(both ClientSide and ServerSide) of custom queries/commands.
By default, "_" in custom names are converted into "/".
For example, if custom name is "user_get-by-country", it's modified path will be "/apis/user/get-by-country".
This will be helpful when you create entityName-related custom queries/commands.

```ts
// In client
const { modifyPathInClient } = createCustomPathModifiers(['user_get-by-country', 'user_register-by-code'])
const client = new PhenylHttpClient({ url: 'http://example.com', modifyPath: modifyPathInClient })

// In server
const { modifyPathInServer } = createCustomPathModifiers(['user_get-by-country', 'user_register-by-code'])
const server = new PhenylHttpServer(http.createServer(), { restApiHandler: phenylCore, modifyPath: modifyPathInServer })
```

### StandardEntityDefinition

[deprecated]

### StandardUserDefinition

Definition for standard user.
StandardUserDefinition has authenticate and wrapExecution methods.
You can execute any process by extending StandardUserDefinition and overwriting authenticate and wrapExecution.

```ts
class UserDefinition extends StandardUserDefinition {
  constructor() {
    super({
      entityClient: createEntityClient(),
      accountPropName: "email",
      passwordPropName: "password",
      ttl: 1000 * 60 * 60,
    });
  }

  async authenticate(loginCommand) {
    // do something...
  }

  async wrapExecution(reqData, session, executeFn) {
    // do something...
  }
}
```

### ForeignQueryWrapper

Instance containing ExecutionWrapper and ValidationHandler to attach foreign Entity by foreign key.

```ts
class ForeignQuery extends ForeignQueryWrapper {
  constructor() {
    super(createEntityClient())
  }

  async validation(reqData) {
    // do something...
  }

  async wrapExecution(reqData, session, execution) {
    // do something...
  }
}
```