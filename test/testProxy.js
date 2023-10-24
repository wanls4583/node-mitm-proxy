const HttpProxy = require('../src/HttpsProxy')

new HttpProxy({ 
    // proxyUrl: 'http://127.0.0.1:8281' 
}).createServer()