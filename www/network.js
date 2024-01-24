/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
*/

var exec = require('cordova/exec');
var cordova = require('cordova');
var channel = require('cordova/channel');
var utils = require('cordova/utils');

// Link the onLine property with the Cordova-supplied network info.
// This works because we clobber the navigator object with our own
// object in bootstrap.js.
// Browser and Electron platform do not need to define this property, because
// it is already supported by modern browsers
if (cordova.platformId !== 'browser' && cordova.platformId !== 'electron' && typeof navigator !== 'undefined') {
    utils.defineGetter(navigator, 'onLine', function () {
        return this.connection.type !== 'none';
    });
}

/**
 * Attach connection info listener to the native backend
 *
 * @param {(connectionType:string)=>void} successCallback The function to call when the Connection data is available/modified
 * @param {(error:any)=>void} [errorCallback] The function to call when there is an error getting the Connection data. (OPTIONAL)
 */
function getInfo(successCallback, errorCallback) {
    exec(successCallback, errorCallback, 'NetworkStatus', 'getConnectionInfo', []);
}



function NetworkConnection () {
    this.type = 'unknown';
}

/**
 * @deprecated
 * @param {(connectionType:string)=>void} successCallback The function to call when the Connection data is available/modified
 * @param {(error:any)=>void} [errorCallback] The function to call when there is an error getting the Connection data. (OPTIONAL)
 */
NetworkConnection.prototype.getInfo = function (successCallback, errorCallback) {
    console.warn("cordova-plugin-network-information: use of deprecated method getInfo()." +
        " Better use navigator.onLine and navigator.connection.type to obtain current network state.");
    getInfo(successCallback, errorCallback);
};

var me = new NetworkConnection();
var timerId = null;
var timeout = 500;

channel.createSticky('onCordovaConnectionReady');
channel.waitForInitialization('onCordovaConnectionReady');

channel.onCordovaReady.subscribe(function () {
    getInfo(function (info) {
        me.type = info;
        if (info === 'none') {
            // set a timer if still offline at the end of timer send the offline event
            timerId = setTimeout(function () {
                cordova.fireDocumentEvent('offline');
                timerId = null;
            }, timeout);
        } else {
            // If there is a current offline event pending clear it
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            cordova.fireDocumentEvent('online');
        }

        // should only fire this once
        if (channel.onCordovaConnectionReady.state !== 2) {
            channel.onCordovaConnectionReady.fire();
        }
    },
    function (e) {
        // If we can't get the network info we should still tell Cordova
        // to fire the deviceready event.
        if (channel.onCordovaConnectionReady.state !== 2) {
            channel.onCordovaConnectionReady.fire();
        }
        console.error('Error initializing Network Connection: ' + e, e);
    });

    if(cordova.platformId === 'electron')
    {
        var online = navigator.onLine;
        function updateOnlineStatus() {
            if(navigator.onLine!==online)
            {
                online = navigator.onLine;
                exec(
                    null,
                    (error)=>{console.error("cannot set navigator online status", error);},
                    'NetworkStatus', 'setNavigatorOnlineStatus', [online]
                );
            }
        }
        window.addEventListener('online', updateOnlineStatus)
        window.addEventListener('offline', updateOnlineStatus)
    }
});

module.exports = me;
