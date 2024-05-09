declare module "managed-http-proxy" {

    // Supply a target here
    // The serverID
    export const createProxyServer: HttpProxyServer['createProxyServer'];
    export const getServerMiddleware: HttpProxyServer['getServerMiddleware'];
    export const responseHelpers: HttpProxyServer['responseHelpers'];

    type HttpProxyServer = {

        createProxyServer: (options: import("http-proxy").ServerOptions) => number;
        getServerMiddleware: (serverId: number, method: HandlerMethods, url: string, registrationOptions?: ProxyServerRegistrationOptions) => import("express").RequestHandler;
        responseHelpers: {

            isStatusOK: (statusCode: number) => boolean,
            shouldUseCache: (statusCode: number) => boolean,
        }
    };

    type ActiveProxyServersMap = Map<number, ProxyServer>;

    type ProxyServer = {

        server: import("http-proxy"),
        Handlers: ProxyServerHandlersMap,
        // target: string,
        target: import("http-proxy").ProxyTarget,
        dynamicHandlerUrls: string[]
    };

    type ProxyServerHandlersMap = Map<string, ProxyServerHandlers>;

    type ProxyServerHandlers = {

        request?: ProxyServerRequestHandler,
        response?: ProxyServerResponseHandlers
    };

    type HandlerMethods = "POST" | "GET" | "DELETE" | "PUT" | "PATCH";

    type ProxyServerRegistrationOptions = {

        request: ProxyServerRequestHandler,
        response: ProxyServerResponseHandlers
    };

    type ProxyServerRegistrationOptions = {

        request: ProxyServerRequestHandler,
        response: ProxyServerResponseHandlers
    };

    type ProxyServerRequestHandler = {

        handler: ProxyServerRequestHandlerCallback,
        options: import("http-proxy").ServerOptions
    };

    //Handles the request
    type ProxyServerRequestHandlerCallback = () => string;

    type ProxyServerResponseHandlers = {

        responseHandler: ProxyServerResponseHandlerCallback
        redirectHandler: ProxyServerResponseRedirectCallback
    }

    //Handle the response.
    /**
     * Converted interceptedBuffer to appropriate type for use if processing it based on your request
     * ResponseGenerator is used to generate different response eg. render a html file, request download of a file, etc
     */
    type ProxyServerResponseHandlerCallback = (interceptedBuffer: Buffer, res: import("express").Response, statusCode: number, responseGenerator: ResponseGenerator) => Promise<ResponseHandlerResult>;

    type ResponseGenerator = {

        renderView: RenderView,
        errorCode: ErrorCode
        parseBuffer: BufferParser
    }

    //Set up view relative to the express view path
    //Contains rendered HTML
    type RenderView = (res: import("express").Response, view: string, templateOptions: *) => Promise<ResponseHandlerResult>;

    type ErrorCode = (code: number, msg: string) => ResponseHandlerResult;

    type BufferParser = {

        json: JsonBufferParser
    }; 

    type JsonBufferParser = (buffer: Buffer) => object;

    type ProxyServerResponseRedirectCallback = (res: import("http").ServerResponse, redirectUrl: string) => void;

    type ResponseHandlerResult = {

        interceptedResponse: Buffer | string,
        status: {
            code: number, 
            msg: string
        }
    };
}