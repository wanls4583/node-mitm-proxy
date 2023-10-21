const path = require('path');
const forge = require('node-forge');
const pki = forge.pki;
const tls = require('tls');
const https = require('https');
const fs = require('fs');

const CertAndKeyContainer = require('./CertAndKeyContainer');

const defaultCaCertPath = path.join(__dirname, '../rootCA/rootCA.crt');
const defaultCaKeyPath = path.join(__dirname, '../rootCA/rootCA.key.pem');

module.exports = class FakeHttpsWebSite{
    constructor({ requestHandler, caCertPath = defaultCaCertPath, caKeyPath = defaultCaKeyPath }) {
        this.requestHandler = requestHandler
        this.caCertPath = caCertPath
        this.caKeyPath = caKeyPath
        this.init();
    }
    init() {
        try {
            fs.accessSync(this.caCertPath, fs.F_OK);
            fs.accessSync(this.caKeyPath, fs.F_OK);
        } catch (e) {
            console.log(`在路径下：${this.caCertPath} 未找到CA根证书`, e);
            return
        }

        const caCertPem = fs.readFileSync(this.caCertPath);
        const caKeyPem = fs.readFileSync(this.caKeyPath);
        const caCert = forge.pki.certificateFromPem(caCertPem);
        const caKey = forge.pki.privateKeyFromPem(caKeyPem);

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
    async createServer(hostname, port) {
        let certObj = await this.certContainer.getCertPromise(hostname, port)
        return new Promise((resolve, reject) => {
            var fakeServer = new https.Server({
                key: pki.privateKeyToPem(certObj.key),
                cert: pki.certificateToPem(certObj.cert),
                SNICallback: async (hostname, done) => {
                    let certObj = await this.certContainer.getCertPromise(hostname, port)
                    done(null, tls.createSecureContext({
                        key: pki.privateKeyToPem(certObj.key),
                        cert: pki.certificateToPem(certObj.cert)
                    }))
                }
            });

            fakeServer.listen(0, () => {
                let address = fakeServer.address();
                resolve(address.port);
            });

            fakeServer.on('request', (req, res) => {
                this.requestHandler.onRequest(req, res, true);
            });

            fakeServer.on('error', (e) => {
                reject(e)
            });
        })
    }
}
