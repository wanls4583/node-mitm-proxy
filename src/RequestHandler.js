const url = require('url')
const http = require('http')
const https = require('https')
const colors = require('colors')
const HttpAgent = require('agentkeepalive');
const HttpsAgent = HttpAgent.HttpsAgent;

const _getName = HttpAgent.prototype.getName
const getName = (option) => {
    var name = _getName.call(this, option);
    if (option.customSocketId) {
        name += ':' + option.customSocketId
    }
    return name;
}

HttpsAgent.prototype.getName = getName
HttpAgent.prototype.getName = getName

const httpsAgent = new HttpsAgent({
    keepAlive: true,
    timeout: 60000,
    keepAliveTimeout: 30000,
    rejectUnauthorized: false
})

const httpAgent = new HttpAgent({
    keepAlive: true,
    timeout: 60000,
    keepAliveTimeout: 30000 // free socket keepalive for 30 seconds
})


module.exports = class RequestHandler {
    constructor() {
        this.socketId = 0
    }
    async onRequest(req, res, ssl) {
        var proxyReq = null;
        var urlObject = url.parse(req.url);
        var defaultPort = ssl ? 443 : 80;
        var protocol = ssl ? 'https:' : 'http:';
        var headers = Object.assign({}, req.headers)
        var rOptions = {
            protocol: protocol,
            hostname: req.headers.host.split(':')[0],
            method: req.method,
            port: req.headers.host.split(':')[1] || defaultPort,
            path: urlObject.path,
            headers: headers
        }

        delete headers['proxy-connection']
        
        if (headers.connection === 'close') {
            req.socket.setKeepAlive(false);
        } else {
            headers.connection = 'keep-alive'
            req.socket.setKeepAlive(true, 30000)
            rOptions.agent = ssl ? httpsAgent : httpAgent
        }

        // mark a socketId for Agent to bind socket for NTLM
        if (req.socket.customSocketId) {
            rOptions.customSocketId = req.socket.customSocketId;
        } 
        // else if (headers['authorization']) {
        //     rOptions.customSocketId = req.socket.customSocketId = this.socketId++;
        // }

        var proxyRequestPromise = () => {
            return new Promise((resolve, reject) => {
                proxRequest(resolve, reject)
            })
        }

        var proxRequest = (resolve, reject) => {
            proxyReq = (rOptions.protocol == 'https:' ? https : http).request(rOptions, (proxyRes) => {
                // !process.env.hideLog &&console.log(colors.green(`request:`), rOptions.hostname + rOptions.path)
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

        try {
            const proxyRes = await proxyRequestPromise()

            if (!res.headersSent) {  // prevent duplicate set headers
                Object.keys(proxyRes.headers).forEach((key) => {
                    if (proxyRes.headers[key] != undefined) {
                        // https://github.com/nodejitsu/node-http-proxy/issues/362
                        if (/^www-authenticate$/i.test(key)) {
                            if (proxyRes.headers[key]) {
                                proxyRes.headers[key] = proxyRes.headers[key] && proxyRes.headers[key].split(',').map(item => item.trim());
                            }
                            req.socket.customSocketId = req.socket.customSocketId || this.socketId++
                        }
                        res.setHeader(key, proxyRes.headers[key])
                    }
                })
                res.writeHead(proxyRes.statusCode)
                proxyRes.pipe(res)
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