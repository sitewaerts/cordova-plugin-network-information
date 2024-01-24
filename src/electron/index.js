const isOnline = require("@esm2cjs/is-online").default;
const network = require('network');

const logEnabled = false;
const logPrefix = 'cordova-plugin-network-information/src/electron/index.js';

function log(message, error)
{
    if (logEnabled !== true)
        return;
    if (error === undefined)
        console.log(`${logPrefix}: ${message}`);
    else
        console.error(`${logPrefix}: ${message}`, error);
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

/**
 *
 * @type {Array<(connectionType:string)=>void>}
 */
const listeners = [];

/**
 * @type {boolean}
 */
let navigatorOnLine = true;

/**
 * @typedef {Object} State
 * @property {boolean} online
 * @property {string} type
 */

/**
 *
 * @type {State|null}
 */

let lastState = null;
/**
 *
 * @param {State} state
 * @returns {State | null}
 */
function setState(state)
{
    try
    {
        if (!state.online)
            state.type = Connection.NONE; // expected by www/network.js

        let modified;
        if (!lastState)
            modified = true;
        else
            modified = lastState.online !== state.online || lastState.type !== state.type;

        if (modified)
        {
            lastState = state;
            const type = lastState?.type || Connection.NONE;
            for(const l of listeners)
            {
                try
                {
                    l(type);
                } catch (e)
                {
                    console.error("cannot notify listener", e);
                }
            }
        }
    } catch (e)
    {
        log("cannot publish connection type", e);
    }
    // noinspection JSValidateTypes
    return lastState;
}

/**
 * @returns {Promise<boolean>}
 */
function checkOnline(){
    if(!navigatorOnLine)
        return Promise.resolve(false);
    return isOnline();
}

/**
 *
 * @return {Promise<State | null>}
 */
function updateConnection()
{
    return checkOnline().then((online) =>
    {
        log(`online status: ${online}`);

        if (!online)
            return setState({online: false, type: Connection.NONE});

        return network.get_active_interface(function (err, obj)
        {
            if (err)
            {
                log('failed to retrieve active interface', err);
                return setState({online: true, type: Connection.UNKNOWN})
            }
            else if (!obj)
            {
                log('no active interface', err);
                return setState({online: true, type: Connection.UNKNOWN})
            }
            else
            {
                return setState({online: true, type: networkToConnectionType(obj.type)})
            }
        });
    }).catch((error) =>
    {
        log('failed to retrieve online status', error);
        return setState({online: false, type: Connection.NONE})
    });
}



// Convert the type property of a response from the network package to a Connection type
const networkToConnectionType = function (networkType)
{
    switch (networkType)
    {
        case 'Wired':
            return Connection.ETHERNET;
        case 'Wireless':
            return Connection.WIFI;
        default:
            return Connection.UNKNOWN;
    }
}

const networkInformationPlugin = {
    /**
     * Never calls callbackContext.success() in order to keep the plugin connection open.
     * Instead, uses callbackContext.progress() to update the connection state.
     * @param {Array<any>} args currently not used (always empty)
     * @param {CordovaElectronCallbackContext} callbackContext
     * @void
     */
    getConnectionInfo: function (args, callbackContext)
    {
        // Execute immediately
        updateConnection().then((state)=>{
            callbackContext.progress(state?.type || Connection.NONE)
            listeners.push((connectionType)=>{
                callbackContext.progress(connectionType);
            })
        }, (error)=>{
            // should never happen
            callbackContext.error(error);
        });
    },

    /**
     * internal API
     * @param {boolean} online new navigator online status to be applied
     * @param {CordovaElectronCallbackContext} callbackContext
     * @void
     */
    setNavigatorOnlineStatus: function([online], callbackContext){
        navigatorOnLine = online;
        updateConnection().catch((error)=>{
            // should never happen
            console.log("cannot update connection", error)
        });
        callbackContext.success();
    }
}

/**
 * @type {CordovaElectronPlugin}
 */
const plugin = function (action, args, callbackContext)
{
    if (!networkInformationPlugin[action])
    {
        log(`unknown action = ${action}`);
        return false;
    }

    try
    {
        networkInformationPlugin[action](args, callbackContext);
    } catch (e)
    {
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
