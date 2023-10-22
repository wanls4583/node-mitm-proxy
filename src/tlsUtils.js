const forge = require('node-forge');
const _ = require('lodash');

var utils = exports;
var pki = forge.pki;

utils.covertNodeCertToForgeCert = function (originCertificate) {
    var obj = forge.asn1.fromDer(originCertificate.raw.toString('binary'));
    return forge.pki.certificateFromAsn1(obj);
}

utils.createFakeCertificateByDomain = function (caKey, caCert, domains) {
    var keys = pki.rsa.generateKeyPair(2046);
    var cert = pki.createCertificate();

    domains = typeof domains === 'string' ? [domains] : domains
    cert.publicKey = keys.publicKey;

    cert.serialNumber = (new Date()).getTime() + '';
    cert.validity.notBefore = new Date();
    cert.validity.notBefore.setFullYear(cert.validity.notBefore.getFullYear() - 1);
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
    var attrs = [{
        name: 'commonName',
        value: domains[0]
    }, {
        name: 'countryName',
        value: 'CN'
    }, {
        shortName: 'ST',
        value: 'GuangDong'
    }, {
        name: 'localityName',
        value: 'ShengZhen'
    }, {
        name: 'organizationName',
        value: 'node-mitmproxy'
    }, {
        shortName: 'OU',
        value: 'https://github.com/wuchangming/node-mitmproxy'
    }];

    let defaultHostList = utils.getHostList(domains).map(item => {
        return {
            type: 2,
            value: item
        }
    })

    cert.setIssuer(caCert.subject.attributes);
    cert.setSubject(attrs);

    cert.setExtensions([{
        name: 'basicConstraints',
        critical: true,
        cA: false
    },
    {
        name: 'keyUsage',
        critical: true,
        digitalSignature: true,
        contentCommitment: true,
        keyEncipherment: true,
        dataEncipherment: true,
        keyAgreement: true,
        keyCertSign: true,
        cRLSign: true,
        encipherOnly: true,
        decipherOnly: true
    },
    {
        name: 'subjectAltName',
        altNames: defaultHostList
    },
    {
        name: 'subjectKeyIdentifier'
    },
    {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
    },
    {
        name: 'authorityKeyIdentifier'
    }]);
    cert.sign(caKey, forge.md.sha256.create());

    return {
        key: keys.privateKey,
        cert: cert
    };
}

utils.createFakeCertificateByCA = function (caKey, caCert, originCertificate) {
    var certificate = utils.covertNodeCertToForgeCert(originCertificate);

    var keys = pki.rsa.generateKeyPair(2046);
    var cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;

    cert.serialNumber = certificate.serialNumber;
    cert.validity.notBefore = new Date();
    cert.validity.notBefore.setFullYear(cert.validity.notBefore.getFullYear() - 1);
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

    cert.setSubject(certificate.subject.attributes);
    cert.setIssuer(caCert.subject.attributes);

    certificate.subjectaltname && (cert.subjectaltname = certificate.subjectaltname);

    var subjectAltName = _.find(certificate.extensions, { name: 'subjectAltName' });
    cert.setExtensions([{
        name: 'basicConstraints',
        critical: true,
        cA: false
    },
    {
        name: 'keyUsage',
        critical: true,
        digitalSignature: true,
        contentCommitment: true,
        keyEncipherment: true,
        dataEncipherment: true,
        keyAgreement: true,
        keyCertSign: true,
        cRLSign: true,
        encipherOnly: true,
        decipherOnly: true
    },
    {
        name: 'subjectAltName',
        altNames: subjectAltName.altNames
    },
    {
        name: 'subjectKeyIdentifier'
    },
    {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
    },
    {
        name: 'authorityKeyIdentifier'
    }]);
    cert.sign(caKey, forge.md.sha256.create());

    return {
        key: keys.privateKey,
        cert: cert
    };
}

utils.isMappingHostName = function (DNSName, hostname) {
    var reg = DNSName.replace(/\./g, '\\.').replace(/\-/g, '\\-').replace(/\*/g, '[^.]+');
    reg = '^' + reg + '$';
    return (new RegExp(reg)).test(hostname);
}

utils.getHostNamesFromCert = function (cert) {
    let hostList = [];
    let altNames = cert.getExtension('subjectAltName') ? cert.getExtension('subjectAltName').altNames : [];
    hostList.push(cert.subject.getField('CN') ? cert.subject.getField('CN').value : '');
    hostList = hostList.concat(_.map(altNames, 'value'));
    return hostList;
}

utils.getHostList = function (hostnames) {
    let defaultHostList = []
    hostnames = typeof hostnames === 'string' ? [hostnames] : hostnames
    hostnames = Array.from(new Set(hostnames))
    hostnames.forEach(hostname => {
        defaultHostList.push(hostname)
        let arr = hostname.split('.')
        for (let i = arr.length - 2; i >= 0; i--) {
            defaultHostList.push('*.' + arr.slice(i).join('.'))
        }
    })
    return Array.from(new Set(defaultHostList))
}
