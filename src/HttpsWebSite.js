const path = require('path');
const forge = require('node-forge');
const pki = forge.pki;
const tls = require('tls');
const https = require('https');
const fs = require('fs');
const tlsUtils = require('./tlsUtils');
const colors = require('colors');

const CertAndKeyContainer = require('./CertAndKeyContainer');

const defaultCaCertPath = path.join(__dirname, '../rootCA/rootCA.crt');
const defaultCaKeyPath = path.join(__dirname, '../rootCA/rootCA.key.pem');

module.exports = class FakeHttpsWebSite {
    constructor({ requestHandler, maxQueue = 100, caCertPath = defaultCaCertPath, caKeyPath = defaultCaKeyPath }) {
        this.requestHandler = requestHandler
        this.caCertPath = caCertPath
        this.caKeyPath = caKeyPath
        this.serverQueue = []
        this.waitQueue = []
        this.maxQueue = maxQueue
        this.initCert()
    }
    initCert() {
        try {
            fs.accessSync(this.caCertPath, fs.F_OK)
            fs.accessSync(this.caKeyPath, fs.F_OK)
        } catch (e) {
            console.log(`在路径下：${this.caCertPath} 未找到CA根证书`, e)
            return
        }

        const caCertPem = fs.readFileSync(this.caCertPath)
        const caKeyPem = fs.readFileSync(this.caKeyPath)
        const caCert = forge.pki.certificateFromPem(caCertPem)
        const caKey = forge.pki.privateKeyFromPem(caKeyPem)

        this.certContainer = new CertAndKeyContainer({
            caCert: caCert,
            caKey: caKey
        })
    }
    /**
     * 根据CA证书生成一个伪造的https服务
     * @param  {[type]} ca         [description]
     * @param  {[type]} hostname     [description]
     * @param  {[type]} successFun [description]
     * @return {[type]}            [description]
     */
    async createServer(hostname) {
        // !process.env.hideLog && console.log(colors.yellow('connect server:'), hostname)

        for (let i = this.serverQueue.length - 1; i >= 0; i--) {
            let serverObj = this.serverQueue[i]
            if (serverObj.hostList.find(host => tlsUtils.isMappingHostName(host, hostname))) {
                return serverObj.promise
            }
        }

        this.promiseObj = this.promiseObj || _createPromise.call(this)
        this.waitQueue.push(hostname)

        return this.promiseObj

        function _createPromise() {
            return new Promise((resolve, reject) => {
                if (this.waitQueue.length > 1) {
                    _createServer.call(this, resolve, reject)
                } else {
                    setTimeout(() => {
                        _createServer.call(this, resolve, reject)
                    }, 500)
                }
            })
        }

        async function _createServer(resolve, reject) {
            const certObj = this.certContainer.getCert(this.waitQueue)
            let httpsServer = new https.Server({
                key: pki.privateKeyToPem(certObj.key),
                cert: pki.certificateToPem(certObj.cert),
                SNICallback: async (hostname, done) => {
                    let certObj = this.certContainer.getCert(hostname)
                    done(null, tls.createSecureContext({
                        key: pki.privateKeyToPem(certObj.key),
                        cert: pki.certificateToPem(certObj.cert)
                    }))
                }
            })

            httpsServer.listen(0)

            httpsServer.on('listening', () => {
                resolve(httpsServer.address().port)
                this.addServerObj({
                    promise: this.promiseObj,
                    hostList: tlsUtils.getHostNamesFromCert(certObj.cert)
                })
                // !process.env.hideLog && console.log(colors.green('add server:'), hostname)
                this.promiseObj = null
                this.waitQueue = []
            })

            httpsServer.on('request', (req, res) => {
                this.requestHandler.onRequest(req, res, true)
            })

            httpsServer.on('error', (e) => {
                reject(e)
            })
        }
    }
    addServerObj(serverObj) {
        if (this.serverQueue.length > this.maxQueue) {
            let serverObj = this.serverQueue.shift()
            serverObj.server && serverObj.server.close()
            serverObj.promise.reject({ exceedMaxQueue: true })
        }
        this.serverQueue.push(serverObj)
    }
}
