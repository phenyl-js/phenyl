# @phenyl/redux

State synchronization among Phenyl CentralState(server) and LocalState(client) using Redux.

## Usage

Apply phenyl middleware to redux middleware.
PhenylHttpClient instance is required to create phenyl middleware for synchronization with CentralState(server).

```ts
import { createMiddleware, reducer } from "@phenyl/redux";
import { createStore, applyMiddleware } from "redux";
import PhenylHttpClient from "@phenyl/http-client";

const httpClient = new PhenylHttpClient({ url: "localhost:8080" });
const middleware = createMiddleware({ client: httpClient });
const enhancer = applyMiddleware(middleware);
const store = createStore(reducer, enhancer);
```

## API Documentation

- createRedux
- createInitialState
- createReducer
- createMiddleware
- LocalStateFinder
- LocalStateUpdater

### createRedux

Create middleware, reducer and actions for phenyl redux.

```ts
const { middleware, reducer, actions } = createPhenylRedux({
  client: RestApiClient<TypeMap>
})
```

### createInitialState

Create initialState of phenyl redux store.

```ts
const initialState = createInitialState<TypeMap>()
```

### createReducer

Create reducer for phenyl redux.

```ts
const reducer = createReducer<TypeMap>()
```

### createMiddleware

Create middleware for phenyl redux.
Applying this middleware will synchronize local state with the server state.

```ts
const middleware = createMiddleware({ client:  RestApiClient<TypeMap>})
```

### LocalStateFinder

Methods for getting entity from redux state for phenyl.
LocalStateFinder has the following static methods.

- hasEntityField
- hasEntity
- getHeadEntity
- getEntityInfo
- hasDiffBetweenOriginAndHead

### LocalStateUpdater

Methods for updating entity from redux state for phenyl.
LocalStateUpdater has the following static methods.

- initialize
- commit
- revert
- follow
- unfollow
- addUnreachedCommits
- removeUnreachedCommits
- clearUnreachedCommitsByEntityInfo
- networkRequest
- removeNetworkRequest
- patch
- rebase
- synchronize
- followAll
- setSession
- unsetSession
- error
- online
- offline
- resolveError

## Installation

```sh
npm install @phenyl/redux
```
