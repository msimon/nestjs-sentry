import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
// import { InjectSentry } from "./sentry.decorator";
import { SentryService } from "./sentry.service";

import {
    HttpArgumentsHost,
    WsArgumentsHost,
    RpcArgumentsHost
  } from '@nestjs/common/interfaces';

import type { GqlContextType, GqlExecutionContext as GqlExecutionContextTpe } from '@nestjs/graphql';

// Sentry imports
import { Scope } from '@sentry/hub';
import { Handlers } from '@sentry/node';

let GqlExecutionContext: any;
try {
  ({ GqlExecutionContext } = require('@nestjs/graphql'));
} catch (e) {}


@Injectable()
export class GraphqlInterceptor implements NestInterceptor {
    private client: SentryService = SentryService.SentryServiceInstance();
    constructor(
        // @InjectSentry() private readonly client: SentryService
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        // first param would be for events, second is for errors
        return next.handle().pipe(
            tap(null, (exception) => {
                this.client.instance().withScope((scope) => {
                    switch (context.getType<GqlContextType>()) {
                        case 'http':
                            return this.captureHttpException(
                                scope,
                                context.switchToHttp(),
                                exception
                            );
                        case 'rpc':
                            return this.captureRpcException(
                                scope,
                                context.switchToRpc(),
                                exception,
                            );
                        case 'ws':
                            return this.captureWsException(
                                scope,
                                context.switchToWs(),
                                exception,
                            );
                        case 'graphql':
                            return this.captureGraphqlException(
                                scope,
                                GqlExecutionContext.create(context),
                                exception
                            );
                    }
                })
            })
        );
    }

    private captureHttpException(scope: Scope, http: HttpArgumentsHost, exception: any): void {
        const data = Handlers.parseRequest(<any>{}, http.getRequest(), {});

        scope.setExtra('req', data.request);

        if (data.extra) scope.setExtras(data.extra);
        if (data.user) scope.setUser(data.user);

        this.client.instance().captureException(exception);
    }

    private captureRpcException(
        scope: Scope,
        rpc: RpcArgumentsHost,
        exception: any,
    ): void {
        scope.setExtra('rpc_data', rpc.getData());

        this.client.instance().captureException(exception);
    }

    private captureWsException(
        scope: Scope,
        ws: WsArgumentsHost,
        exception: any,
    ): void {
        scope.setExtra('ws_client', ws.getClient());
        scope.setExtra('ws_data', ws.getData());

        this.client.instance().captureException(exception);
    }

    private captureGraphqlException(scope: Scope, gqlContext: GqlExecutionContextTpe, exception: any): void {
        const info = gqlContext.getInfo()
        const context = gqlContext.getContext()

        scope.setExtra('type', info.parentType.name)

        if (context.req) {
            // req within graphql context needs modification in
            const data = Handlers.parseRequest(<any>{}, context.req, {});

            scope.setExtra('req', data.request);

            if (data.extra) scope.setExtras(data.extra);
            if (data.user) scope.setUser(data.user);
        }

        this.client.instance().captureException(exception);
    }
}
