const os = require('os');

function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
            if ('IPv4' !== iface.family || iface.internal) {
                continue;
            }
            addresses.push(iface.address);
        }
    }
    return addresses;
}

module.exports = {
    getLocalIpAddresses
};
