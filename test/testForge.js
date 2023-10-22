const forge = require('node-forge')
const pki = forge.pki


console.time(1)
var keys = pki.rsa.generateKeyPair(2048);
console.timeEnd(1)

console.time('2')
pki.rsa.generateKeyPair({bits: 2048}, function(err, keys) {
    console.timeEnd('2')
})