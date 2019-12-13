import { EncodedHttpRequest, EncodedHttpResponse } from "./http";

import { GeneralTypeMap } from "./type-map";
import { RestApiClient, GeneralRestApiClient } from "./rest-api-client";
import { RestApiHandler, GeneralRestApiHandler } from "./rest-api-handler";

export interface GeneralServerParams {
  restApiHandler: GeneralRestApiHandler;
  modifyPath?: PathModifier;
  customRequestHandler?(
    encodedHttpRequest: EncodedHttpRequest,
    restApiClient: GeneralRestApiClient
  ): Promise<EncodedHttpResponse>;
}

export interface ServerParams<TM extends GeneralTypeMap>
  extends GeneralServerParams {
  restApiHandler: RestApiHandler<TM>;
  modifyPath?: PathModifier;
  customRequestHandler?(
    encodedHttpRequest: EncodedHttpRequest,
    restApiClient: RestApiClient<TM>
  ): Promise<EncodedHttpResponse>;
}

/**
 * (path: string) => string
 * Real server path to regular path.
 * The argument is real path string, start with "/".
 * e.g. (path) => path.slice(8)
 * e.g. (path) => path.split(/^\/path\/to/)[1]
 */
export type PathModifier = (path: string) => string;

/**
 * Custom Request Handler.
 * Receive non-API HTTP request and return HTTP response in 'phenyl-http-server' and 'phenyl-lambda-adapter' modules.
 *  (non-API Request: request whose path doesn't start with "/api/")
 * Response can be any type, like HTML/CSS/JavaScript/Image.
 *
 * Intended Use: Web page. Don't use this function as API.
 * Example: Rich API explorer like swagger.
 *
 * The second argument "restApiClient" is a client to access directly to PhenylRestApi (bypass HTTP).
 *
 * When you need to pass `TypeMap`, use `CustomRequestHandler` instead.
 */
export type GeneralCustomRequestHandler = Required<
  GeneralServerParams
>["customRequestHandler"];

/**
 * Custom Request Handler.
 * See `GeneralCustomRequestHandler` for details.
 */
export type CustomRequestHandler<TM extends GeneralTypeMap> = Required<
  ServerParams<TM>
>["customRequestHandler"];
