/// //<reference path="./http_proxy_server.d.ts" />
//@ts-ignore
/// <reference types="managed-http-proxy" />
//@ts-check
const { IncomingMessage, ServerResponse } = require("http");
const httpProxy = require("http-proxy");
const queryString = require("querystring");
const zlib = require("zlib");
/**
 * @type {import("managed-http-proxy").ActiveProxyServersMap}
 */
let runningServers = new Map();
const URL_PARAM_FULL_MARKER = "/:";
const URL_MATCH_ALL_FULL_MARKER = "/*";
const URL_MATCH_ALL_SPECIAL_MARKER = "*";
const URL_QUERY_MARKER = "?";
const URL_PARAM_COLON_MARKER = ":";
const URL_SPLITTER = "/";

/**
 * @type {import("managed-http-proxy").HttpProxyServer}
 */
const HttpProxyServer = {

    createProxyServer: (options) => {

        if(!options.target){

            throw new Error("No target provided. Proxy server will not be created");
        }
        const proxyServer = httpProxy.createProxyServer(options);
        //Get id. Use to reference correct server entry and Handlers for listeners (Automatically zero bases it)
        const serverId = runningServers.size;
        //Set up listeners
        //Request
        proxyServer.on("proxyReq", (proxyReq, req, res, options) => {

            //@ts-expect-error Property 'body' doesn't exist in type IncomingMessage
            if(!req.body || !Object.keys(req.body).length){

                return;
            }
            /**
             * @type {string}
             */
            //@ts-expect-error Type string | number | string[] is not assignable to type string
            const contentType = proxyReq.getHeader('Content-Type');
            let bodyData;
            if(contentType){

                if(contentType.includes("application/json")){

                    //@ts-expect-error Property 'body' doesn't exist in type IncomingMessage
                    bodyData = JSON.stringify(req.body);
                } else if(contentType.includes("application/x-www-form-urlencoded")){
    
                    //@ts-expect-error Property 'body' doesn't exist in type IncomingMessage
                    bodyData = queryString.stringify(req.body);
                }
            }
            if(bodyData){

                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
        });
        //Response
        proxyServer.on("proxyRes", onProxyResponse.bind(this, serverId));
        //Create our server object
        /**
         * @type {import("managed-http-proxy").ProxyServer}
         */
        let serverObject = {};
        serverObject.server = proxyServer;
        serverObject.target = options.target;
        serverObject.Handlers = new Map();
        serverObject.dynamicHandlerUrls = [];
        //Add to map
        runningServers.set(serverId, serverObject);
        console.log(`Proxy server successfully created with id ${serverId} and target ${options.target}`);
        //Return the serverId
        return serverId;
    },

    getServerMiddleware: (serverId, method, url, registrationOptions) => {

        if(!method || !url){

            throw new Error("Provide the method and url for the server middleware to be created");
        }
        if(!url.startsWith(URL_SPLITTER)){

            throw new Error("The provided url must start with a forward slash (/) -  culprit: " + url);
        }
        const serverObject = runningServers.get(serverId);
        if(!serverObject){

            throw new Error(`Server with id ${serverId} not found. Middleware cannot be created`);
        }
        //Do registration
        doRegistration(serverId, method, url, registrationOptions);
        const server = serverObject.server;
        /**
         * 
         * @param {import("express").Request} req 
         * @param {import("express").Response} res 
         * @param {import("express").NextFunction} next 
         */
        const middleware = (req, res, next) => {

            /**
             * @type {import("http-proxy").ServerOptions}
             */
            let middlewareOptions;
            if(serverObject.Handlers){

                const requestHandler = serverObject.Handlers.get(getHandlerContext(req.method, req.originalUrl, serverId));
                middlewareOptions = requestHandler && requestHandler.request ? requestHandler.request.options : null;
            }
            middlewareOptions = {
                    
                target: middlewareOptions && middlewareOptions.target ? middlewareOptions.target : `${serverObject.target}${req.baseUrl}`,
                ...middlewareOptions
            };
            server.web(req, res, middlewareOptions, (e) => {

                console.log("Failed to proxy with error:\n");
                console.log(e);
                res.sendStatus(500);
            });
        }

        return middleware;
    },

    responseHelpers: {

        /**
         * @param {number} statusCode
         */
        isStatusOK: (statusCode) => {

            const statusOk = statusCode === 200 || statusCode === 304;
            if(!statusOk){

                console.log("Status not OK with code: " + statusCode);
            }
            return statusOk;
        },

        /**
         * 
         * @param {number} statusCode 
         * @returns 
         */
        shouldUseCache: (statusCode) => {

            return statusCode === 304;
        }
    }
}

/**
 * Register request handler, request options, response handler, redirect handler
 * for a given path and request method
 * 
 * Can only be called once for any given path and request method
 * 
 * @param {number} serverId 
 * @param {import("managed-http-proxy").HandlerMethods} method 
 * @param {string} url Ensure this is the same url used to make the request to the actual server, in case you are mutating the paths on call using target. Thus should have the same value to the path in target (without host)
 * @param {import("managed-http-proxy").ProxyServerRegistrationOptions} registrationOptions
 */
function doRegistration(serverId, method, url, registrationOptions){

    //Remove last / if put
    url = url.charAt(url.length - 1) === URL_SPLITTER ? url.slice(0, url.length - 2) : url;
    //Set the context. Refuse if already have it set
    const context = setHandlerContext(method, url, serverId);
    //Ensure the options are okay
    registrationOptions = checkAndStandardizeOptions(registrationOptions);
    //register the request handler
    registerRequestHandlerAndOptions(serverId, context, registrationOptions.request);
    //register the response handler
    registerResponseHandler(serverId, context, registrationOptions.response);
    console.log(`Completed registration for server ID ${serverId} with context ${context}`);
}

/**
 * 
 * @param {import("managed-http-proxy").ProxyServerRegistrationOptions} registrationOptions 
 * @returns {import("managed-http-proxy").ProxyServerRegistrationOptions} Registration options with standardized options
 */
function checkAndStandardizeOptions(registrationOptions){

    //Allow to pass null or undefined
    if(!registrationOptions){

        registrationOptions = getDefaultRegistrationOptions();
    }
    //Get original values
    let _responseHandlers = registrationOptions.response;
    let _requestOptions = registrationOptions.request ? registrationOptions.request.options : null;
    //Populate relevant object properties and standardize options 
    const standardizedOptions = populateAndstandardizeOptions(registrationOptions);
    if(_requestOptions || _responseHandlers) { //Do checks if any of the options had been provided

        //Update to standardized options
        _requestOptions = standardizedOptions.request.options;
        _responseHandlers = standardizedOptions.response;
        //Check validity of passed options
        if(_requestOptions.selfHandleResponse && !_responseHandlers.responseHandler){

            throw new Error(`selfHandleResponse  is true. Please provide a response handler`);
        } 
        if(!_requestOptions.followRedirects && !_responseHandlers.redirectHandler){

            throw new Error(`followRedirects is false. Please provide a redirect handler`);
        }
        if(!_requestOptions.selfHandleResponse && _responseHandlers.responseHandler){

            throw new Error(`selfHandleResponse is false but a response handler has been provided. It will not be called`);
        }
    }

    return registrationOptions;
}

/**
 * Standardized options and fill in missing values
 * @param {import("managed-http-proxy").ProxyServerRegistrationOptions} registrationOptions 
 * @returns {import("managed-http-proxy").ProxyServerRegistrationOptions} Standardized options
 */
function populateAndstandardizeOptions(registrationOptions){

    const responseHandlers = registrationOptions.response;
    let requestOptions = registrationOptions.request ? registrationOptions.request.options : null;
    //If no response handler entries
    if(!responseHandlers){

        registrationOptions.response = {

            responseHandler: null,
            redirectHandler: null
        }
    }
    if(!requestOptions){ //If no request option entries

        requestOptions = getDefaultMiddlewareOptions();
        //Update the new options to the object
        registrationOptions.request = {

            ...registrationOptions.request,
            options: requestOptions
        };
    } else if(requestOptions.followRedirects === null || requestOptions.followRedirects === undefined){

        //Add the default followRedirects value if not set originally
        registrationOptions.request.options = {

            followRedirects: true,
            ...requestOptions
        }
    }

    return registrationOptions;
}

/**
     * Set the request handler and options for a given path and request method
     * 
     * Only call if you wish to uniquely handle requests
     * 
     * @param {number} serverId 
     * @param {string} context
     * @param {import("managed-http-proxy").ProxyServerRequestHandler} requestHandler
     */
function registerRequestHandlerAndOptions(serverId, context, requestHandler){

    runningServers.get(serverId).Handlers.set(context, {

        request: requestHandler
    });
}

/**
 * Set the response handler and options for a given path and request method
 * 
 * Only call if you wish to uniquely handle responses
 * 
 * @param {number} serverId 
 * @param {string} context
 * @param {import("managed-http-proxy").ProxyServerResponseHandlers} handlers
 */
function registerResponseHandler(serverId, context, handlers){

    const currentHandler = runningServers.get(serverId).Handlers.get(context);

    runningServers.get(serverId).Handlers.set(context, {

        request: currentHandler.request,
        response: handlers
    });
}

/**
 * Code inspired by: https://github.com/chimurai/http-proxy-middleware/blob/d7623983e18f0daa724a3fcc0b5d4d1812e4c3c1/src/handlers/response-interceptor.ts#L18
 * (export function responseInterceptor)
 * 
 * Listener for proxy response event
 * @param {number} serverId 
 * @param {IncomingMessage} proxyRes 
 * @param {IncomingMessage} req 
 * @param {ServerResponse} res 
 */
async function onProxyResponse(serverId, proxyRes, req, res){

    //Only allow this if set to selfHandleRes. Apparrently, http-proxy just fires this whether the flag is true or not. Difference, res.end() has been called
    const reqMethod = res.req.method;
    //@ts-expect-error Property originalUrl doesn't exist on type IncomingMessage
    const reqBaseUrl = res.req.originalUrl;
    const resStatusCode = proxyRes.statusCode;
    const handlerContext = getHandlerContext(reqMethod, reqBaseUrl, serverId);
    const handlers = runningServers.get(serverId).Handlers.get(handlerContext);
    //If redirecting, follow if allowed to
    //@ts-expect-error Type req doesn't exist on type IncomingMessage
    if(handlers && proxyRes.req._redirectable && proxyRes.req._redirectable._isRedirect){

        console.log("Redirecting");
        //@ts-expect-error Type req doesn't exist on type IncomingMessage
        const redirectUrl = proxyRes.req._redirectable._currentUrl;
        if(handlers.request.options.followRedirects){

            //Redirect to correct url
            //@ts-expect-error Type redirect doesn't exist on type ServerResponse<IncomingMessage>
            res.redirect(redirectUrl);
        } else {

            handlers.response.redirectHandler(res, redirectUrl);
        }
    } else if(handlers && handlers.request.options.selfHandleResponse){

        const originalProxyRes = proxyRes; //Use by chimurai's code in interceptor. Personally, I see no need
        let buffer = Buffer.from("", "utf-8");
        //decompress the response from the proxy
        const _proxyRes = decompress(proxyRes, proxyRes.headers['content-encoding']);
        //Concat the data stream
        _proxyRes.on("data", (chunk) => {

            buffer = Buffer.concat([buffer, chunk]);
        });
        _proxyRes.on("end", async () => {

            //Copy original headers to res
            copyHeaders(proxyRes, res);
            
            //Call our handler, if one is there
            //Call interceptor with intercepted response
            //https://github.com/chimurai/http-proxy-middleware/blob/d7623983e18f0daa724a3fcc0b5d4d1812e4c3c1/src/handlers/response-interceptor.ts#L37
            //If handler available for url, let it handle the response. Else, handle locally
            console.log(`Handler to be triggered for server ID ${serverId} and context ${handlerContext}`);
            let interceptedBuffer = Buffer.from(buffer);
            /**
             * @type {import("managed-http-proxy").ResponseHandlerResult}
             */
            let resHandlerResult;
            if(runningServers.get(serverId).Handlers){

                const handlerObj = runningServers.get(serverId).Handlers.get(handlerContext);
                if(handlerObj && handlerObj.response){
                    
                    const responseHandler = handlerObj.response.responseHandler;
                    if(responseHandler){

                        //Call handlers if not a 304;
                        if(!HttpProxyServer.responseHelpers.shouldUseCache(resStatusCode)){
                            
                            console.log("Handler for response fired");
                            //@ts-expect-error Some weird type mismatch. Doesn't affect code execution.
                            resHandlerResult = await responseHandler(buffer, res, resStatusCode, ResponseGenerator);
                        } else {

                            console.log("Unmodified. Handler not triggered");
                            resHandlerResult = ResponseGenerator.respondUnmodified();
                        }
                        interceptedBuffer = Buffer.from(resHandlerResult.interceptedResponse);
                    }
                }
            }

            //Set the correct content-length (with double byte character support)
            res.setHeader("content-length", Buffer.byteLength(interceptedBuffer, 'utf-8'));
            //Set the status codes and status messages. These implictly call writeHead() after which no more heads can be written
            if(resHandlerResult.status){

                res.statusCode = resHandlerResult.status.code;
                res.statusMessage = resHandlerResult.status.msg;
            } else {

                //Put original status code and status messages
                res.statusCode = originalProxyRes.statusCode;
                res.statusMessage = originalProxyRes.statusMessage;
            }

            //Write the buffer to the response
            res.write(interceptedBuffer);
            res.end();
        });
    }
}

/**
 * Streaming decompression of proxy response
 * source: https://github.com/apache/superset/blob/9773aba522e957ed9423045ca153219638a85d2f/superset-frontend/webpack.proxy-config.js#L116
 * via: https://github.com/chimurai/http-proxy-middleware/blob/d7623983e18f0daa724a3fcc0b5d4d1812e4c3c1/src/handlers/response-interceptor.ts#L57 
 * 
 * @param {IncomingMessage} proxyRes 
 * @param {string} contentEncoding 
 */
function decompress(proxyRes, contentEncoding){

    let _proxyRes = proxyRes;
    let decompress;

    switch(contentEncoding){

        case 'gzip':
            decompress = zlib.createGunzip();
            break;
        case 'br':
            decompress = zlib.createBrotliDecompress();
            break;
        case 'deflate':
            decompress = zlib.createInflate();
            break;
        default:
            break;
    }

    if(decompress){

        _proxyRes.pipe(decompress);
        //@ts-expect-error
        _proxyRes = decompress;
    }

    return _proxyRes;
}

/**
 * Copy original headers
 * https://github.com/apache/superset/blob/9773aba522e957ed9423045ca153219638a85d2f/superset-frontend/webpack.proxy-config.js#L78
 * @param {IncomingMessage} originalResponse 
 * @param {ServerResponse} response 
 */
function copyHeaders(originalResponse, response){

    if(response.setHeader) {

        let keys = Object.keys(originalResponse.headers);
        //ignore chunked, brotli, gzip, deflate headers
        keys = keys.filter((key) => !['content-encoding', 'transfer-encoding'].includes(key));
        keys.forEach((key) => {

            let value = originalResponse.headers[key];
            if(key === 'set-cookie'){

                //remove the cookie domain (Will set for client as default) 
                //TODO improve this and work based on options
                value = Array.isArray(value) ? value : [value];
                value = value.map((x) => x.replace(/Domain=[^;]+?/i, ''));
            }

            response.setHeader(key, value);
        });
    } else {

        //@ts-expect-error
        response.headers = originalResponse.headers;
    }
}

/**
 * @deprecated
 * @param {number} statusCode 
 * @returns 
 */
function isRedirect(statusCode){

    return statusCode === 201 || statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308;
}

/**
 * Set the context for a handler
 * Rejects if context already set with handlers
 * @param {import("managed-http-proxy").HandlerMethods} method 
 * @param {string} url 
 * @param {number} serverId
 * @returns {string}
 */
function setHandlerContext(method, url, serverId){

    const isDynamicUrl = handlerUrlDynamic(url);
    if(isDynamicUrl){

        if(!runningServers.get(serverId).dynamicHandlerUrls.includes(url)){

            console.log("Registering dynamic url: " + url);
            runningServers.get(serverId).dynamicHandlerUrls.push(url);
        } else {

            throw new Error("Dynamic handler url already set: " + url);
        }
    }

    const context = getSimpleHandlerContext(method, url);
    //If we have handlers set for this context and serverID already, reject
    if(runningServers.get(serverId).Handlers.get(context)){

        if(isDynamicUrl){

            //Remove from dynamic urls array
            runningServers.get(serverId).dynamicHandlerUrls.splice(runningServers.get(serverId).dynamicHandlerUrls.findIndex((dynamicUrl) => dynamicUrl === url), 1);
        }
        throw new Error(`Registration already done for context ${context} with server ID ${serverId}`);
    }

    return context;
}

/**
 * Know if a handler url is dynamic or not
 * @param {string} url 
 */
function handlerUrlDynamic(url){

    return url.includes(URL_PARAM_FULL_MARKER) || url.endsWith(URL_MATCH_ALL_FULL_MARKER); //|| url.includes(URL_QUERY_MARKER)
}

/**
 * CHECK FIRST IF URL MATCHES DYNAMIC and rewire url to dynamic one
 * Get the context for the correct handlers and options for a route
 * @param {import("managed-http-proxy").HandlerMethods | string} method 
 * @param {string} url 
 * @param {number} serverId 
 * @returns {string}
 */
function getHandlerContext(method, url, serverId){

    return getSimpleHandlerContext(method, mapContextUrl(method, url, serverId));
}

/**
 * map a passed url properly. If dynamic, map to dynamic. If not dynamic, return as is
 * @param {import("managed-http-proxy").HandlerMethods | string} method
 * @param {string} url 
 * @param {number} serverId 
 * @returns {string} The mapped url
 */
function mapContextUrl(method, url, serverId){

    //Remove all queries from url
    const _url = removeQueriesFromUrl(url);
    //If simple context hits to a handler obj, no mapping to continue. Else, map
    //Helps to also avoid hitting dynamic that is not dynamic i.e predetermined patterns almost matching
    //dynamic in regex. For instance /user/:id and /user/register
    if(runningServers.get(serverId).Handlers.get(getSimpleHandlerContext(method, _url))){

        return _url;
    } else {

        let mappedURL;
        //Check if matches any dynamic then map appropriately
        const dynamicURLSList = runningServers.get(serverId).dynamicHandlerUrls;
        let dynamicURL, _dynamicURL, tokenizedDynamicUrl, tokenizedUrl;
        for(let i = 0; i < dynamicURLSList.length; i++){

            dynamicURL = dynamicURLSList[i];
            _dynamicURL = removePrecedingForwardSlash(dynamicURL); //TODO Should remove this slash from the urls BEFORE adding to list
            if(dynamicURL.endsWith(URL_MATCH_ALL_FULL_MARKER)){

                //Processing potential match all hit urlCongruentToMatchAll()
                //Tokenize based on dynamic url without match all marker. Should have two tokens
                if(urlCongruentToMatchAll(_dynamicURL, removePrecedingForwardSlash(_url))){

                    mappedURL = dynamicURL;
                    break;
                }
            } else {

                tokenizedDynamicUrl = _dynamicURL.split(URL_SPLITTER);
                tokenizedUrl = removePrecedingForwardSlash(_url).split(URL_SPLITTER);
                //Process if length same for parameterized or 
                if(tokenizedDynamicUrl.length === tokenizedUrl.length){

                    //Make sure the url is congruent to dynamic url using RegEx and return
                    if(urlCongruentToDynamic(_dynamicURL, _url)){

                        //Pass
                        mappedURL = dynamicURL;
                        break;
                    }
                }
            }
        }

        if(!mappedURL){

            console.warn("\n\nUrl should be dynamic, but failed to map. Returning base url\n\n");
        }

        // console.log("END OF LOOP: Mapped URL for context is " + (mappedURL ? mappedURL : _url) + " from " + _url);
        return mappedURL ? mappedURL : _url;
    }
}

/**
 * 
 * @param {string} url 
 */
function removeQueriesFromUrl(url){

    //tokenize
    let tokenizedUrl = url.split(URL_SPLITTER);
    //replace last token (containing query)
    tokenizedUrl[tokenizedUrl.length - 1] = tokenizedUrl[tokenizedUrl.length - 1].replace(/\/*\?[\s\S]*$/g, "");
    //Join
    url = tokenizedUrl.join(URL_SPLITTER);
    //Remove last /
    url = url.charAt(url.length - 1) === URL_SPLITTER ? url.slice(0, url.length - 1) : url;

    return url;
}

/**
 * Tries to see whether a dynamic match all url is congruent to a given full url
 * 
 * URLs have preceding slash removed
 * @param {string} _dynamicURL dynamic url
 * @param {string} _url url to be matched
 * @returns {boolean} whether the url is congruent to match all
 */
function urlCongruentToMatchAll(_dynamicURL, _url){

    //The given url should start with the raw url of the match all dynamic url i.e url without the /* (URL_MATCH_ALL) special marker
    const _matchAllDynamicRaw = _dynamicURL.replace(URL_MATCH_ALL_FULL_MARKER, "");
    if(_url.startsWith(_matchAllDynamicRaw)){

        //Match found
        return true;
    }

    return false;
}

/**
 * By default, adds a preceding / to the given url, if missing, for final RegEx check
 * Easier to process
 * 
 * @param {string} _dynamicUrl 
 * @param {string} url 
 * @returns {boolean} whether the url is congruent to the dynamic url
 */
function urlCongruentToDynamic(_dynamicUrl, url){

    //Split the dynamic url based on the URL_SPLITTER
    const tokenizedDynamic = _dynamicUrl.split(URL_SPLITTER);
    let processedDynamic = "";
    //Get the indices of params markers. Thinking of query markers later?
    let paramIndices = [];
    for(let i = 0; i < tokenizedDynamic.length; i++){

        if(tokenizedDynamic[i].charAt(0) === URL_PARAM_COLON_MARKER){

            paramIndices.push(i);
        }
    }

    //Join tokens before this indices with the URL SPLITTER, then escape, then add appropriate regex marker for dynamic points
    for(let i = 0; i <= paramIndices.length; i++){

        let startIndex = i === 0 ? 0 : paramIndices[i - 1] + 1;
        let endIndex = i < paramIndices.length ? paramIndices[i] : tokenizedDynamic.length;
        //Only do processing if not out of bounds
        if(startIndex < tokenizedDynamic.length){

            let reformedUrl = `/${tokenizedDynamic.slice(startIndex, endIndex).join(URL_SPLITTER)}`;
            //Ensure not "/"". Caused by splitting at times
            if(i < paramIndices.length){

                //Current param infront of processed url. Add marker at end with backslash
                processedDynamic+= escapeForRegExp(`${reformedUrl}/`) + "[\s\S]*";
            } else {
    
                //All params passed. Only escape reformed url. No / escape and character group
                processedDynamic+= escapeForRegExp(`${reformedUrl}`);
            }
        }
    }

    //Post process url
    if(url.charAt(0) !== URL_SPLITTER){

        url = `/${url}`;
    }

    //convert to regex and check. Return answer
    return new RegExp(processedDynamic, "i").test(url);
}

/**
 * @param {string} url 
 */
function removePrecedingForwardSlash(url){

    return url.charAt(0) === "/" ? url.substring(1, url.length) : url;
}

/**
 * 
 * @param {string} string 
 * @returns {string} Escaped string to allow creation of a regular expression from the string
 * 
 * https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
 */
function escapeForRegExp(string){

    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
}

/**
 * 
 * @param {import("managed-http-proxy").HandlerMethods | string} method 
 * @param {string} url 
 * @returns {string}
 */
function getSimpleHandlerContext(method, url){

    return `${method} | ${url}`;
}

/**
 * @returns {import("managed-http-proxy").ProxyServerRegistrationOptions}
 */
function getDefaultRegistrationOptions(){

    return {

        request: null,
        response: null
    }
}

/**
 * Read more at: https://www.npmjs.com/package/http-proxy#options 
 * @returns {import("http-proxy").ServerOptions}
 */
function getDefaultMiddlewareOptions(){

    return {

        //@ts-expect-error boolean is allowed
        hostRewrite: false, //rewrites the location hostname on (201/301/302/307/308) redirects
        autoRewrite: false, //rewrites the location host/port on (201/301/302/307/308) redirects based on requested host/port. Default: false.
        protocolRewrite: null, //rewrites the location protocol on (201/301/302/307/308) redirects to 'http' or 'https'. Default: null.
        cookieDomainRewrite: false, //rewrites domain of set-cookie headers (IMPLEMENT THIS OPTION CHECK IN CODE)
        cookiePathRewrite: false, //rewrites path of set-cookie headers.
        followRedirects: true, //specify whether you want to follow redirects (by default. If false, handle explicitly in res handler)
    }
}

const ResponseGenerator = {

    /**
     * Will return the rendered html as a string or an empty string with a fail status code (500)
     * 
     * @param {import("express").Response} res 
     * @param {string} view 
     * @param {*} options 
     * @returns {Promise<import("managed-http-proxy").ResponseHandlerResult>} response as rendered HTML
     */
    renderView: async (res, view, options) => {

        return new Promise((resolve) => {

            let renderedHTML;
            let statusCode;
            let statusMsg;
            res.render(view, { layout: view, ...options }, (err, html) => {

                renderedHTML = err ? '' : html;
                statusCode = err ? 500 : 200;
                statusMsg = err ? "Internal server error" : "OK";
                if(err){

                    console.log(err);
                };
                //Set the appropriate headers
                res.setHeader('content-type', "text/html");
                resolve({

                    interceptedResponse: renderedHTML,
                    status: {

                        code: statusCode,
                        msg: statusMsg
                    }
                });
            });
        });
    },

    /**
     * 
     * @param {number} code 
     * @param {string} msg 
     * @returns {import("managed-http-proxy").ResponseHandlerResult} string empty. Just passed to buffer
     */
    errorCode: (code, msg) => {

        return {

            interceptedResponse: '',
            status: {

                code: code,
                msg: msg
            }
        };
    },

    /**
     * @returns {import("managed-http-proxy").ResponseHandlerResult} a 304 code to the browser
     */
    respondUnmodified: () => {

        return {

            interceptedResponse: '',
            status: {

                code: 304,
                msg: ''
            }
        };
    },

    parseBuffer: {

        /**
         * 
         * @param {Buffer} buffer 
         */
        json: (buffer) => {

            return JSON.parse(buffer.toString())
        }
    },
}

module.exports = HttpProxyServer;