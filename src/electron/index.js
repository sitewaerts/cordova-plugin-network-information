const isOnline = require("@esm2cjs/is-online").default;
const network = require('network');

const logEnabled = false;
const logPrefix = 'cordova-plugin-network-information/src/electron/index.js';

function log(message, error) {
    if (logEnabled !== true) {
        return;
    }
    if (error === undefined) {
        console.log(`${logPrefix}: ${message}`);
    } else {
        console.error(`${logPrefix}: ${message}`, error);
    }
}

// Values have to be kept in sync with ../../www/Connection.js
const Connection = {
    UNKNOWN: 'unknown',
    ETHERNET: 'ethernet',
    WIFI: 'wifi',
    CELL_2G: '2g',
    CELL_3G: '3g',
    CELL_4G: '4g',
    CELL: 'cellular',
    NONE: 'none'
};

// Node.js doesn't provide something like the browser online/offline detection
// So we use setInterval with the following interval for polling the state
const ConnectionPollInterval = 1000;

// Keep track of the last type so we only notify the app if the type changed
let lastConnectionType = Connection.UNKNOWN;

// Keep track of the online status so that we only query the connection type if necessary
// Note that this approach means we can only detect connection type changes when the online status changes
let lastOnlineStatus = null;

// Convert the type property of a response from the network package to a Connection type
const networkToConnectionType = function (networkType) {
    switch (networkType) {
        case 'Wired': return Connection.ETHERNET;
        case 'Wireless': return Connection.WIFI;
        default: return Connection.UNKNOWN;
    }
}

const networkInformationPlugin = {
    /**
     * Never calls callbackContext.success() in order to keep the plugin connection open.
     * Instead uses callbackContext.progress() to update the connection state. 
     * @param {Array<any>} args currently not used (always empty)
     * @param {CallbackContext} callbackContext
     * @void
     */
    getConnectionInfo: function(args, callbackContext)
    {
        const updateConnection = function () {
            isOnline().then(newOnlineStatus => {
                log(`status: ${newOnlineStatus}`);
                if (newOnlineStatus === lastOnlineStatus) {
                    return;
                }
                log(`status changed from ${lastOnlineStatus} to ${newOnlineStatus}`);
                lastOnlineStatus = newOnlineStatus;
                network.get_active_interface(function (err, obj) {
                    if (!obj || err) {
                        callbackContext.error(err);
                    } else {
                        const newConnectionType = networkToConnectionType(obj.type);
                        if (lastConnectionType != newConnectionType) {
                            lastConnectionType = newConnectionType;
                            callbackContext.progress(newConnectionType);
                        }
                    }
                });
            }).catch(error => {
                log('failed to retreive status', error);
            });
        };

        // Execute once immedately so that the app startup is not delayed by the timer below
        updateConnection();

        setInterval(updateConnection, ConnectionPollInterval);
    }
}

/**
 * cordova electron plugin api
 * @param {string} action
 * @param {Array<any>} args
 * @param {CallbackContext} callbackContext
 * @returns {boolean} indicating if action is available in plugin
 */
const plugin = function (action, args, callbackContext)
{
    if (!networkInformationPlugin[action]) {
        log(`unknown action = ${action}`);
        return false;
    }

    try {
        networkInformationPlugin[action](args, callbackContext);
    } catch (e) {
        const message = `${logPrefix}: ${action} failed`;
        console.error(message, e);
        callbackContext.error({message: message, cause: e});
    }
    return true;
}

// backwards compatibility: attach api methods for direct access from old cordova-electron platform impl
Object.keys(networkInformationPlugin).forEach((apiMethod) =>
{
    plugin[apiMethod] = (args) =>
    {
        return Promise.resolve((resolve, reject) =>
        {
            networkInformationPlugin[apiMethod](args, {
                progress: (data) =>
                {
                    console.warn(`${logPrefix}: ignoring progress event as not supported in old plugin API`, data);
                },
                success: (data) =>
                {
                    resolve(data)
                },
                error: (data) =>
                {
                    reject(data)
                }
            });
        });
    }
});


module.exports = plugin;
