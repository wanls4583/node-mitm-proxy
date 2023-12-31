const tlsUtils = require('./tlsUtils');
const colors = require('colors')

module.exports = class CertAndKeyContainer {
    constructor({
        caCert,
        caKey
    }) {
        this.caCert = caCert
        this.caKey = caKey
        this.certQueue = []
        this.maxQueue = 1000
    }
    getCert (hostnames) {
        hostnames = typeof hostnames === 'string' ? [hostnames] : hostnames
        for (let i = this.certQueue.length - 1; i >= 0; i--) {
            let cerItem = this.certQueue[i]
            for (let hostname of hostnames) {
                if (cerItem.hostList.find(host => tlsUtils.isMappingHostName(host, hostname))) {
                    return cerItem.cert
                }
            }
        }

        let certObj = tlsUtils.createFakeCertificateByDomain(this.caKey, this.caCert, hostnames)
        let hostList = tlsUtils.getHostNamesFromCert(certObj.cert)
        this.addQueue({
            cert: certObj,
            hostList: hostList
        })

        !process.env.hideLog && console.log(colors.green('added-cert: '), Array.from(new Set(hostnames)).join('|'))

        return certObj
    }
    addQueue(obj) {
        if (this.certQueue.length > this.maxQueue) {
            this.certQueue = this.caCert.slice(-900)
        }
        this.certQueue.push(obj)
    }
}
