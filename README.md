# Simple-HTTP-Proxy
An extended implementation of node-http-proxy to allow the creation of multiple managed proxy servers in Node and webpack-dev-server environments

**********************************************************************************************************************************************************************************

This simple-http-proxy-library is built on top of the open source node-http-proxy library https://www.npmjs.com/package/http-proxy. It allows you to create and manage several http-proxy servers and use their middleware within a Node.js or webpack-dev-server-environment. Therefore, you can have multiple servers running with unique targets for each and managed middleware for each server.

The simple-http-proxy server also allows you to set up middlewares for dynamic URLs, supporting the Express.js-style url formats for /myurl/:param and /myurl/* (for match all).

**Usage**

**Create a Proxy Server**

//import the simple-http-proxy library
const HttpProxyServer = require("simple-http-proxy");
//Create the server. Save the server id
const serverID = HttpProxyServer.createProxyServer({

    target: "http://localhost:3000"
});

The HttpProxyServer.createProxyServer() method creates a http-proxy server. It takes arguments 
