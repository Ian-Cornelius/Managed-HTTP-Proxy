# Managed-HTTP-Proxy
An extended implementation of node-http-proxy to allow the creation of multiple managed proxy servers in Node and webpack-dev-server environments

**********************************************************************************************************************************************************************************

This managed-http-proxy-library is built on top of the open source [node-http-proxy library](https://www.npmjs.com/package/http-proxy). It allows you to create and manage several http-proxy servers and use their middleware within a Node.js or webpack-dev-server environment. Therefore, you can have multiple servers running with unique targets for each and managed middleware for each server.

The managed-http-proxy server also allows you to set up middlewares for dynamic URLs, supporting the Express.js-style url formats for /myurl/:param (for parameterized urls) and /myurl/* (for match all).

## Usage

### Create a Proxy Server

```
//import the managed-http-proxy library
const HttpProxyServer = require("managed-http-proxy");

//Create the server. Save the server id
const serverID = HttpProxyServer.createProxyServer({

    target: "http://localhost:3000"
});
```
The createProxyServer() method takes the same object as the core library. See the list of all valid options here: https://github.com/http-party/node-http-proxy/blob/HEAD/lib/http-proxy.js#L26-L42

It returns a serverID that you'll use to create middlewares for various requests later. Therefore, you can create several servers for different proxies and create a middleware for each uniquely based on your needs for a specific route.

### Use the proxy server as a middleware

```
//Use the server as middleware in your express app
app.get("/", HttpProxy.getServerMiddleware(myServerId, "GET", "/"));
```

getServerMiddleware() takes three arguments. These are the id of the server the middleware is for, the HTTP method for the request you'll make using the server, and the route. 

### About Urls (Updated for version 1.0.4)

#### Url Provided to getServerMiddleware()

The url you provide when creating the middleware is not necessarily the url that the proxy server will use to make the request to the target. 

With default options (no target provided), the library forwards the original url of the request to the target source. However, this changes depending on certain properties you pass in the request.options object.

Regardless, managed-http-proxy is designed such that when creating the middleware, the url you provide **should match** the url of the express middleware it is attached to. The library references the original url of the middleware before the proxy to resolve handlers.

Example:

```
app.post("/*", HttpProxy.getServerMiddleware(myProxyServerId, "POST", "/*", {

    request: {

        selfHandleResponse: true //No target provided. Options can also be null. Behavior will be the same.
    }
})); 
```

When setting up a managed-http-proxy middleware for a general purpose express middleware, the url provided in the proxy middleware is also assumed to be the url your express middleware resolves to. Example:

```
app.use(HttpProxy.getServerMiddleware(myGoogleServerId, "GET", "/*"));
```

This middleware will assume the primary express middleware fires for all '/*' route calls, and the handlers, if specified, will fire only for routes that match that case.

#### Url Resolution for Target

With specific properties in request.options provided, url behavior is modified as follows (please note, this doesn't affect how you specify the path when creating middlewares. Look at the section above (Url Provided to getServerMiddleware())):

##### Specifying a "target" in request.options.target

managed-http-proxy allows you to modify the url of the target server for each middleware you create using getServerMiddleware(). However, unlike the core library which modifies the whole path, managed-http-proxy appends to the main target provided when creating the proxy server using createProxyServer().

Example:

```
app.get("/myHomePage", (req, res, next) => {

    //Do a few things in your primary middleware

    //Transfer control to the proxy middleware to complete the request.
    next();
}, HttpProxy.getServerMiddleware(myProxyHomePageServerId, "GET", "/myHomePage", {

    request: {

        options: {

            target: "/home",
        }
    }
}));
```

Since you've retargeted the original url, the proxy will make the request using a modified url of the form `${request.options.target}${primaryExpressMiddlewarePath}` to the target resource. In this example, that will be /home/myHomePage. 

If you don't want the path in your primary express middleware (/myHomePage) appended to it, you can add one more property to request.options.

###### Update: V 1.0.5 (Dynamic Target Urls for request.options.target)
To better support remapping of dynamic urls through the request.options.target option, V 1.0.5 introduces _DYNAMIC_TARGET_OVERRIDE, passed through res.locals, that allows us to dynamically remap the target as the middleware is used/invoked.

Therefore, we can pass in a fully resolved url that contains params and queries to the proxy as we become aware of their actual values at runtime.

Example:

```
app.get("/api/cats/:statusCode", (req, res, next) => {

    res.locals[HttpProxy._DYNAMIC_TARGET_OVERRIDE] = `/${statusCode}`;
    next();
}, HttpProxy.getServerMiddleware(serverId, "GET", "/api/cats/:statusCode", {

    //@ts-expect-error
    request: {

        options: {

            ignorePath: true
        }
    }
}));
```
Say, for a statusCode of 301 at runtime, above will remap /api/cats/301 to /301. If it changes to /api/cats/302, the param of the dynamic target also accurately changes to /302

Will work with ignorePath directive.

##### Specify request.options.ignorePath

When set to true, this property will alter the proxy's resolution of the final request url, and stop it from appending the path/url in your primary express middleware. Let's use the example above for illustration:

```
app.get("/myHomePage", (req, res, next) => {

    //Do a few things in your primary middleware

    //Transfer control to the proxy middleware to complete the request.
    next();
}, HttpProxy.getServerMiddleware(myProxyHomePageServerId, "GET", "/myHomePage", {

    request: {

        options: {

            target: "/home",
            ignorePath: true
        }
    }
}));
```
Instead of /home/myHomePage, the proxy middleware now takes /home as the final url for the target resource since the original path in the primary express middleware is ignored.

##### The Rule of Thumb for Target Url Resolution

If you don't specify a path in request.options.target, the same url in the primary express middleware is forwarded to the proxy.

If you specify a path in request.options.target, but don't set request.options.ignorePath to true, the proxy makes a request to the target resource using the url in the format `${request.options.target}${primaryExpressMiddlewarePath}`.

If you specify a path in request.options.target, and set request.options.ignorePath to true, the proxy uses the url `${request.options.target}` to make the request to the target resource.

Please check the official documentation of node-http-proxy for more alterations to this behavior.

#### HTTP Methods

With the current implementation, the HTTP method you pass should also match the original method in your express middleware. The proxy currently only forwards requests to a target server, so it will infer from your middleware the request method and url. Matching the method and the url or its dynamic form, will ensure your response handlers fire for the correct requests and responses.

#### Setting Up a Response Handler

You can provide these through the registrationOptions object, which has the following properties:

```
    ProxyServerRegistrationOptions = {

        request: {

            options: {

                //Set this to true if you want to post-process the response from the server before its sent to the client
                selfHandleResponse: boolean 
            }
        },
        response: {

            responseHandler: ProxyServerResponseHandlerCallback
            redirectHandler: ProxyServerResponseRedirectCallback
        }
    }
```
You also have other properties you can send to request.options, of the type import("http-proxy").ServerOptions (full list [here](https://github.com/http-party/node-http-proxy?tab=readme-ov-file#options)). This library forwards these options to the core node-http-proxy library when running the proxy requests.

#### Example

```
router.get("/myRoute/:previewId", HttpProxyServer.getServerMiddleware(myServerId, "GET", "/myRoute/:previewId", {

    request: {

        options: {

            //Set to self handle the response
            selfHandleResponse: true
        }
    },
    response: {

        //Post process the response from the server before the proxy forwards it to the client
        //Buffer contains the buffered response from the target server
        responseHandler: async (buffer, res, statusCode, responseGenerator) => {

            //A simple implementation of responseHelpers to determine if status is okay (200). Expandable for other codes. See "utilities" section
            if(HttpProxyServer.responseHelpers.isStatusOK(statusCode)){

                //A simple implementation of a response generator to perform some trivial actions. See "utilities" section
                return await responseGenerator.renderView(res, "my-view-template", { ...responseGenerator.parseBuffer.json(buffer), ...myOtherDataInThisServer});
            } else {

                return responseGenerator.errorCode(statusCode);
            }
        }
    }
}));
```

## Utilities

There are a few helpful utilities availed by managed-http-proxy to make using it a lot easier, especially when post-processing the response. These utilities are simplistic at the moment, and will be improved to cater for larger scopes and cases. If you wish to contribute to them, feel free to leave a PR.

### responseHelpers

This utility helps quickly decipher if the response from the target server is status OK or if the target server has responded with cache (304 unmodified). Currently available functions are:

``` 
HttpProxyServer.responseHelpers.isStatusOK(statusCode: number): boolean
HttpProxyServer.responseHelpers.shouldUseCache(statusCode: number): boolean
```

### responseGenerator

This utility helps generate the final response that the proxy server will push to the client or resource that made the request. The currently available functions are:

```
//Renders a view using the passed template and options for data. Assumes you've set up your views correctly in the express app
responseGenerator.renderView(res: import("express").Response, view: string, templateOptions: *) => Promise<ResponseHandlerResult>;

//Generates an error with the provided code and message
responseGenerator.errorCode(code: number, msg: string): ResponseHandlerResult

//Parses the buffer to your desired type. Currently supports json
responseGenerator.parseBuffer.json(buffer: Buffer): object
```

## Making HTTP to HTTPS Requests

In case you run into certificate errors when making a http to https request using the proxy, add the option changeOrigin when creating the http proxy server. Example:

```
/**
 * Create the proxy server
 */
const myGoogleServerId = HttpProxy.createProxyServer({

    target: "https://www.google.com",
    changeOrigin: true
});
```
You can also read and provide ssl certificates based on your specific use case. Kindly [read about this](https://github.com/http-party/node-http-proxy?tab=readme-ov-file#options) in the docs for the core library node-http-proxy. managed-http-proxy forwards these options to the core library when creating the server and attaching middlewares, so everything should work as expected. 

There's also an [insightful thread](https://stackoverflow.com/questions/14262986/node-js-hostname-ip-doesnt-match-certificates-altnames) in StackOverflow covering the same. [Direct link to solution](https://stackoverflow.com/a/45579167).

## Using it with Webpack
With webpack, you can intercept the webpack-dev-server middleware and implement your own for extended functionality. This can be useful for accessing REST APIs developed and maintained outside your development environment. 

You can checkout the [webpack-dev-server documentation](https://webpack.js.org/configuration/dev-server/) for how to do this, but here's a snippet.

```
// Your webpack configuration file: webpack.dev.js

devServer: {

        devMiddleware: {

            index: "index.hbs",
            writeToDisk: true,
        },
        
        setupMiddlewares: devServerExpressConfig,
    }
```

```
// devServerExpressConfig.js

module.exports = function (middlewares, devServer){ 

    const app = devServer.app;

    //import the managed-http-proxy library
    const HttpProxyServer = require("managed-http-proxy");

    //Create the server. Save the server id
    const serverID = HttpProxyServer.createProxyServer({

        target: "http://localhost:3000"
    });

    /**
     * Configuring view engine
     */
    app.set("views", path.join(__dirname, "../dist/views"));

    //Configure a middleware and use as you do in normally in an express app
    app.post("/new-user", HttpProxyServer.getServerMiddleware(serverID, "POST", "/new-user", createNewUserRegistrationOptions));
}
```

## Updates
This library is currently at its infancy. However, before making it open source, I had used it for over a year, managing proxy access through middlewares in my webpack build for a web project. There's a lot to add to, with version 1.0.4 and above now supporting the use of request options as permitted by the core library node-htt-proxy. Please checkout the full list of options [here](https://github.com/http-party/node-http-proxy?tab=readme-ov-file#options)

Feel free to add to the development and make a PR. 

Thanks!