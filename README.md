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

``
NOTE:
``
The url you provide is not the url that the proxy server will use to make the request to the target. The current implementation forwards the original url of the request to the target resource. You can apply a transformation before passing the control to the proxy middleware in case the target needs a different url.

The url you provide is used to target the right response handlers for the request once the target resource responds. You can provide these through the registrationOptions object, which has the following properties:

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
You also have other properties you can send to request.options, of the type import("http-proxy").ServerOptions. However, the library doesn't make use of these options for now.

#### Example

```
router.get("/myRoute/:previewId", HttpProxyServer.getServerMiddleware(myServerId, "GET", "/proxyRoute/api/:previewId", {

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

This utility helps quickly decipher if the response from the target server is status OK or if the target server has responded with cache. Currently available functions are:

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

## Using it with Webpack
With webpack, you can intercept the webpack-dev-server middleware and implement your own for extended functionality. This can be useful for access REST APIs developed and maintained outside your development environment. 

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
    app.post("/new-user", HttpProxyServer.getServerMiddleware(serverID, "POST", "/proxy-new-user", createNewUserRegistrationOptions));
}
```

## Updates
This library is currently at its infancy. However, before making it open source, I had used it for over a year, managing proxy access through middlewares in my webpack build for a web project. There's a lot to add to, such as using more request options, as permitted by the core library node-htt-proxy. 

Feel free to add to the development and make a PR. 

Thanks!