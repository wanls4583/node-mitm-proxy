'use strict'
/**
 *  HTTP Tunnel
 */
const http = require('http');
const url = require('url');
const net = require('net');
const FakeHttpsWebSite = require('./FakeHttpsWebSite')
const RequestHandler = require('./RequestHandler')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
// 启动端口
const port = 6789;

module.exports = class HttpProxy {
  constructor({ caCertPath, caKeyPath } = {}) {
    let requestHandler = new RequestHandler()
    this.requestHandler = requestHandler
    this.fakeHttpsWebSite = new FakeHttpsWebSite({
      caCertPath,
      caKeyPath,
      requestHandler
    })
  }
  createServer() {
    this.server = new http.Server();
    this.server.on('connect', (req, cltSocket, head) => {
      this.onConnect(req, cltSocket, head)
    })
    this.server.on('request', (req, res) => {
      this.onRequest(req, res)
    })
    this.server.on('error', (e) => {
      this.onError(e)
    })
    this.server.listen(port, () => {
      console.log(`简易HTTPS中间人代理启动成功，端口：${port}`);
    });
  }
  onConnect(req, cltSocket, head) {
    let srvUrl = url.parse(`http://${req.url}`);

    this.fakeHttpsWebSite.createServer(srvUrl.hostname, srvUrl.port).then((port) => {
      let srvSocket = net.connect(port, '127.0.0.1', () => {
        cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-agent: MITM-proxy\r\n' +
          '\r\n');
        srvSocket.write(head);
        srvSocket.pipe(cltSocket);
        cltSocket.pipe(srvSocket);
      });
      srvSocket.on('error', (e) => {
        console.error('srvSocket-error', e);
      });
      cltSocket.on('error', (e) => {
        console.log('cltSocket-error', e)
      })
    })
  }
  onRequest(req, res) {
    this.requestHandler.onRequest(req, res);
  }
  onError(e) {
    if (e.code == 'EADDRINUSE') {
      console.error('HTTP中间人代理启动失败！！');
      console.error(`端口：${port}，已被占用。`);
    } else {
      console.error(e);
    }
  }
}