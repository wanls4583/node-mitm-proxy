const tlsUtils = require('./tlsUtils');
const https = require('https');
const colors = require('colors');

module.exports = class CertAndKeyContainer {
    constructor({
        maxQueue = 1000,
        getCertSocketTimeout = 2 * 1000,
        caCert,
        caKey
    }) {
        this.certQueue = []
        this.maxQueue = maxQueue
        this.getCertSocketTimeout = getCertSocketTimeout
        this.caCert = caCert
        this.caKey = caKey
    }
    getCert (hostname, port) {
        for(let i = this.certQueue.length - 1; i >= 0; i--) {
            let serverObj = this.certQueue[i]
            if (serverObj.hostList.find(host => tlsUtils.isMappingHostName(host, hostname))) {
                return serverObj.promise
            }
        }

        if (!process.env.hideLog) {
            console.log(colors.blue('creating cert:'), hostname)
        }

        const certPromiseObj = { hostList: [hostname]}

        let promise = new Promise((resolve, reject) => {
            if (!process.env.hideLog) {
                console.time('cert-head-' + hostname)
                console.time('cert-' + hostname)
            }
            let certObj = null;
            let preReq = https.request({
                port: port,
                hostname: hostname,
                path: '/',
                method: 'HEAD'
            }, (preRes) => {
                try {
                    var realCert  = preRes.socket.getPeerCertificate();
                    console.timeEnd('cert-head-' + hostname)
                    if (!certObj) {
                        if (realCert) {
                            try {
                                certObj = tlsUtils.createFakeCertificateByCA(this.caKey, this.caCert, realCert);
                            } catch (error) {
                                certObj = tlsUtils.createFakeCertificateByDomain(this.caKey, this.caCert, hostname);
                            }
                        } else {
                            certObj = tlsUtils.createFakeCertificateByDomain(this.caKey, this.caCert, hostname);
                        }
                    }
                    resolve(certObj);
                } catch (e) {
                    reject(e);
                }
            });
            preReq.setTimeout(~~this.getCertSocketTimeout, () => {
                if (!certObj) {
                    !process.env.hideLog && console.log(colors.red('get-cert-timeout: '), hostname)
                    certObj = tlsUtils.createFakeCertificateByDomain(this.caKey, this.caCert, hostname);
                    resolve(certObj);
                }
            });
            preReq.on('error', (e) => {
                if (!certObj) {
                    certObj = tlsUtils.createFakeCertificateByDomain(this.caKey, this.caCert, hostname);
                    resolve(certObj);
                }
            })
            preReq.end();
        }).then((certObj) => {
            certPromiseObj.hostList = tlsUtils.getHostNamesFromCert(certObj.cert)
            certPromiseObj.hostList = certPromiseObj.hostList.length ? certPromiseObj.hostList : [hostname]
            if (!process.env.hideLog) {
                console.log(colors.magenta('created cert:'), hostname)
                console.timeEnd('cert-' + hostname)
            }

            return certObj
        })

        certPromiseObj.promise = promise;

        this.addCertPromise(certPromiseObj)

        return promise;
    }
    addCertPromise(certPromiseObj) {
        if (this.certQueue.length > this.maxQueue) {
            let certPromiseObj = this.certQueue.shift()
            certPromiseObj.reject({exceedMaxQueue: true})
        }
        this.certQueue.push(certPromiseObj)
    }
}
