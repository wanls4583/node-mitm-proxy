const url = require('url')
const http = require('http')
const https = require('https')

module.exports = class RequestHandler{
    async onRequest(req, res, ssl) {
        var proxyReq = null;
        var fullUrl = req.url
        var urlObject = url.parse(req.url);
        var defaultPort = ssl ? 443 : 80;
        var protocol = ssl ? 'https:' : 'http:';
        var rOptions = {
            protocol: protocol,
            hostname: req.headers.host.split(':')[0],
            method: req.method,
            port: req.headers.host.split(':')[1] || defaultPort,
            path: urlObject.path,
            headers: req.headers,
        }
    
        if (rOptions.headers.connection === 'close') {
            req.socket.setKeepAlive(false);
        } else if (rOptions.customSocketId != null) {  // for NTLM
            req.socket.setKeepAlive(true, 60 * 60 * 1000);
        } else {
            req.socket.setKeepAlive(true, 30000);
        }
    
        var proxyRequestPromise = () => {
            return new Promise((resolve, reject) => {
                rOptions.host = rOptions.hostname || rOptions.host || 'localhost';
                // use the binded socket for NTLM
                if (rOptions.agent && rOptions.customSocketId != null && rOptions.agent.getName) {
                    var socketName = rOptions.agent.getName(rOptions)
                    var bindingSocket = rOptions.agent.sockets[socketName]
                    if (bindingSocket && bindingSocket.length > 0) {
                        bindingSocket[0].once('free', onFree)
                        return;
                    }
                }
    
                onFree()
    
                function onFree() {
                    proxyReq = (rOptions.protocol == 'https:' ? https : http).request(rOptions, (proxyRes) => {
                        console.log(`request:`, fullUrl)
                        resolve(proxyRes);
                    })

                    proxyReq.on('timeout', () => {
                        reject(`${rOptions.host}:${rOptions.port}, request timeout`);
                    })
    
                    proxyReq.on('error', (e) => {
                        reject(e);
                    })
    
                    proxyReq.on('aborted', () => {
                        reject('server aborted reqest');
                        req.abort();
                    })
    
                    req.on('aborted', function () {
                        proxyReq.abort();
                    })

                    req.pipe(proxyReq);
                }
    
            });
        }
        
        try {
            const proxyRes = await proxyRequestPromise();
    
            if (!res.headersSent) {  // prevent duplicate set headers
                Object.keys(proxyRes.headers).forEach(function (key) {
                    if (proxyRes.headers[key] != undefined) {
                        // https://github.com/nodejitsu/node-http-proxy/issues/362
                        if (/^www-authenticate$/i.test(key)) {
                            if (proxyRes.headers[key]) {
                                proxyRes.headers[key] = proxyRes.headers[key] && proxyRes.headers[key].split(',');
                            }
                            key = 'www-authenticate';
                        }
                        res.setHeader(key, proxyRes.headers[key]);
                    }
                });
    
                res.writeHead(proxyRes.statusCode);
                proxyRes.pipe(res);
            }
        } catch (e) {
            if (!res.finished) {
                res.writeHead(500);
                res.write(`Node-MitmProxy Warning:\n\n ${e.toString()}`);
                res.end();
            }
        }
    
    }
}