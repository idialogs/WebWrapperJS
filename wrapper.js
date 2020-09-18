/**
 * To launch, inject this script file from native code at the top of the document
 * Format string like this, where strWrapperScript is the contents of this file
 * and strHandoff is the json encoded handoff parameters detailed below
 * Always be careful to put quotes around your string arguments! *
 *
 *    ";(" + strWrapperScript + ")('" + strHandoff + "');"
 *
 * To execute wrapper methods, inject js strings like this.
 *    "IdaMobileAppBrowsing.methodName('string')"
 *
 * @param strHandoff - JSON encoded handoff dictionary
 */
function wrapper(strHandoff) {

    //Initialize web wrapper object, communicates to web JS that we are in mobile browsing mode
    window.IdaMobileAppBrowsing = new WebWrapper(JSON.parse(strHandoff));

    var fnStart = function (e) {
        document.documentElement.classList.add('idaMobileLoggedOut');
        window.IdaMobileAppBrowsing.launchApp();
    };
    
    if (/complete|interactive|loaded/.test(document.readyState)) {
        // In case the document has finished parsing, document's readyState will
        // be one of "complete", "interactive" or (non-standard) "loaded".
        fnStart();
    } else {
        // The document is not ready yet, so wait for the DOMContentLoaded event
        document.addEventListener('DOMContentLoaded', fnStart, false);
    }
    
    /**
     * WebWrapper module contains all webview wrapper functionality
     *
     * @returns WebWrapper
     * @constructor
     */
    function WebWrapper(opts) {
        opts = opts || {};

        //Launch ajax debugging if requested
        if (opts.debugAjax) {
            setTimeout(debugAjax, 5);
        }
        
        return {
            /**
             * For debugging, make opts from launch public
             */
            launchOpts: opts,

            /**
             * Communicate oauth token to web JS
             */
            token: opts.oauthToken,

            /**
             * Whether the wrapper app will support deep linking into external apps
             */
            deepLinking: !!opts.deepLinking,

            /**
             * Set/update oauth token
             * @param token
             * @returns {*}
             */
            setToken: function (token) {
                if (token) {
                    document.documentElement.classList.remove('idaMobileLoggedOut');
                } else {
                    document.documentElement.classList.add('idaMobileLoggedOut');
                }
                
                return this.token = token
            },

            defaultAction: opts.defaultAction || "idaMessage",

            /**
             * Bool test if this is xamarin webwrapper
             */
            isXamarin: function () { return !!window.csharp },

            /**
             * Bool test if this is the iOS webwrapper
             */
            isIOs: function () { return !!window.webkit && !!window.webkit.messageHandlers[opts.appName] },

            /**
             * Bool test if this is android webwrapper
             */
            isAndroid: function () { return !!opts.isAndroid },

            /**
             * Contains custom push menu items, re-add if push menu is refreshed
             */
            pushMenuItems: {},

            /**
             * Method to post string message to native app
             *
             * Native apps should implement a common interface
             * for reacting to messages of particular type
             *
             * Message types so far (feel free to add, just notify other devs)
             *
             *  alert - pop up a native alert containing message text
             *  navigate - trigger native app navigation, e.g. "back"
             *  docready - notifies app when "documentReady" JS event has fired
             *  log - output message to native console, message could be any type of object
             *
             * @param type {String}
             * @param data
             */
            postToNativeApp: function (type, data) {
                var payload = {
                    type: type || this.defaultAction,
                    data: data || {}
                };
                
                try {
                    if (this.isXamarin()) {
                        var strPayload = JSON.stringify(payload);
                        
                        if (window[type]) {
                            //Explicitly registered functions
                            window[type](strPayload);
                        } else {
                            //Else post back to default handler
                            window.csharp("{'action':'" + this.defaultAction + "','data':'"+window.btoa(strPayload)+"'}");
                        }
                        
                    } else if (this.isIOs()) {
                        window.webkit.messageHandlers[opts.appName].postMessage(payload);
                       
                    } else if (this.isAndroid()) {
                        window.callToAndroidFunction.postMessage(type, data);
                    }
                } catch (e) {}
            },

            /**
             * Perform native-initiated navigation via ajax call for speed
             */
            ajaxNavigation: function (url, blnHidePage) {
                var $page, callback;

                if (blnHidePage) {
                    $page = $('.page');
                    $page.hide();

                    callback = function () {
                        $page.show();
                    };
                }

                $.publish(
                    'ajax/load',
                    {
                        url: url,
                        callback: callback
                    }
                );
            },

            /**
             * Trigger the displayed data and navigation elements on the page to reload
             *
             * NOTE this does not reset cached assets, that is handled in IdaNetwork (web JS)
             */
            updatePage: function () {
                if (!window.iDialogs || !window.IdaNetwork) { return; }

                //Refresh sub navigations
                if (window.IdaNetwork.getSubNav) {
                    window.IdaNetwork.getSubNav();
                }

                //Refresh content on the page via ajax
                if (window.IdaNetwork.updatePageContent) {
                    window.IdaNetwork.updatePageContent();
                } else {
                    //Fallback, can be deleted later...
                    if (window.iDialogs.constructors.Dashboard.dashboardPage()) {
                        $.publish('module/reload');
                    } else if (!window.IdaNetwork.confirmNav.blnConfirm) {
                        window.iDialogs.methods.updateThisPage('');
                    }
                }
            },

            /**
             * Update the server/version and trigger refresh of dom element
             *
             * @param strServer
             * @param strVersion
             */
            setServerAndVersion: function (strServer, strVersion) {
                opts.version = strVersion;
                opts.server = strServer;
                this.addVersionInfo();
            },

            /**
             * Opens the push navigation menu (hamburger menu)
             */
            showNavigation: function () {
                $.publish('mlpushmenu/toggle');
            },
            
            /**
             * Spin the refresh icon (indicator of updating)
             */
            setRefreshing: function (blnOn) {
                var $refresh = $('[data-btn-action="location"] .fn-location-services-refresh');
                
                //Small delay because it is kind of weird when the spin stops too fast. would be nice to make it full rotations...
                
                if (blnOn) {
                    $refresh.addClass('icon-spin');
                } else {
                    setTimeout(function(){
                        $refresh.removeClass('icon-spin');
                    }, 500)
                }
            },
            
            locationUpdate: function (strJson) {
                var locationData = JSON.parse(strJson);
                
                $.publish('user/locationChange', locationData);
            },

            /**
             * Adds the wrapper app version and server info to the hamburger menu
             */
            addVersionInfo: function () {
                var str = "App v" + opts.version + " Server: " + opts.server;

                if(!this.$versionNode) {
                    this.$versionNode = $(
                        "<p class='mobile-wrapper-info'>" + str + "</p>"
                    );
                } else {
                    this.$versionNode.text(str);
                }

                $('#mp-footer-end').append(this.$versionNode);
            },

            /**
             * Add an item to the ml push menu (hamburger menu)
             * @param name
             * @param link
             * @param icon
             */
            appendPushMenuItem: function (name, link, icon) {
                if(!this.pushMenuItems[name]) {
                    this.pushMenuItems[name] = $(
                        '<li class="ml-link-wrapper">' +
                        '    <a class="ml-link app-nav-link" href="javascript:void()" data-href="' + link + '">' +
                        '        <i class="icon-' + icon + '"></i>' +
                        '        ' + name +
                        '    </a>' +
                        '</li>'
                    );
                }

                $('#mp-menu').find(
                    '.mp-scroll > ul > .ml-link-wrapper:last-child'
                ).after(
                    this.pushMenuItems[name]
                );
            },

            /**
             * If logout screen is visible we hide it and notify the native app
             */
            avoidLogoutScreen: function () {
                var blnLoginPage = !!document.querySelector('.login-page');

                if (blnLoginPage) {
                    $(document.documentElement).addClass('hide');
                    this.postToNativeApp(
                        "logout",
                        {tokenRefresh: !!this.token}
                    );
                }
            },

            getWebConfigValue: function(strKey, blnPost) {
                var value = null;

                try {
                    if (window.IdaGlobals) {
                        value = window.IdaGlobals[strKey] || value;

                        if (window.IdaGlobals.config) {
                            value = window.IdaGlobals.config[strKey] || value;
                        }

                        if (window.IdaGlobals.appInfo) {
                            value = window.IdaGlobals.appInfo[strKey] || value;
                        }
                    }

                    if (window.iDialogs && window.iDialogs.userInfo) {
                        value = window.iDialogs.userInfo[strKey] || value;
                    }
                } catch(e) {}

                if (blnPost) {
                    this.postToNativeApp(
                        "config",
                        {
                            payload: [
                                {
                                    key: strKey,
                                    value: value
                                }
                            ]
                        }
                    );
                }

                return value;
            },

            /**
             * On document ready logic
             */
            launchApp: function () {
                var self = this;

                //Ensures that login screen doesn't get shown if token renewal error
                self.avoidLogoutScreen();

                //Append optional css class to the document element
                if (opts.css_class) {
                    $(document.documentElement).addClass(opts.css_class);
                }

                // Inform native app of document ready and whether we are logged in
                this.postToNativeApp('docready');

                if (!!window.iDialogs) {
                    if (window.iDialogs.userInfo.hasRole) {
                        if (window.iDialogs.userInfo.hasRole('traveling')) {
                            self.postToNativeApp('enable_location_services');
                        } else {
                            self.postToNativeApp('disable_location_services');
                        }
                    }

                    // Checks if user has location tracking privilege
                    window.iDialogs.userInfo.checkPrivilege(
                        'location_tracking',
                        function () {
                            self.postToNativeApp('start_location_tracking');
                        },
                        function () {
                            console.log('WrapperJS: iDialogs location tracking privilege denied.');
                        }
                    );
                }

                //Add version info to page
                if (opts.server && opts.version) {
                    self.addVersionInfo();

                    //When navigation menu is refreshed, we need to re-add the version number
                    $.subscribe('ajax/navRefreshed', function (e, opts) {
                        if (opts.navElement === 'mp-menu') {
                            self.addVersionInfo();

                            if (self.pushMenuItems) {
                                //Re-append push menu items
                                $.each(self.pushMenuItems, function (name, _) {
                                    self.appendPushMenuItem(name);
                                });
                            }
                        }
                    });
                }

                //Append push menu item for app options if specified
                if (opts.app_options) {
                    this.appendPushMenuItem(
                        opts.app_options.name,
                        opts.app_options.link,
                        opts.app_options.icon
                    )
                }

                //If CSS string is provided, put it in the DOM
                if (opts.style) {
                    var style = document.createElement('style');
                    style.innerHTML = opts.style;
                    document.head.appendChild(style)
                }

                //Now that publish is available, notify web JS that app browsing is active
                $.publish('idaMobileApp/load', opts.appName);

                $.attachHandlers(
                    {
                        /**
                         * Forgot password screen
                         * notify user in native app to check their email after resetting PW
                         */
                        forgotPasswordBackButton: {
                            events: 'click',
                            select: '#backSent',
                            method: function (e) {
                                //Show native alert
                                self.postToNativeApp(
                                    'alert',
                                    {message: "Check your email"}
                                );

                                //Navigate back to login screen
                                self.postToNativeApp(
                                    "navigate",
                                    {navigate: "back"}
                                );
                            }
                        },
                        /**
                         * Listener for native logout functionality
                         */
                        logoutNativeApp: {
                            events: ["tap"],
                            select: "[href*='/logout']",
                            method: function (e) {
                                self.postToNativeApp('logout', '{}');
                                self.postToNativeApp('logout');
                            }
                        },
                        /**
                         * General native-app links
                         */
                        nativeAppLink: {
                            events: ["tap"],
                            select: ".app-nav-link",
                            method: function (e) {
                                e.stopImmediatePropagation();
                                e.preventDefault();
                                self.postToNativeApp(
                                    "navigate",
                                    {navigate: this.getAttribute('data-href')}
                                );
                            }
                        },
                        /**
                         * Re-run the logout screen check on any ajax load
                         */
                        avoidLogoutScreenOnLoad: {
                            events: 'ajax/load/complete',
                            method: function () {
                                self.avoidLogoutScreen();
                            }
                        },
                        /**
                         * Make contextmenu action (longpress) act like a tap
                         */
                        touchLongPress: {
                            events: 'press',
                            select: '*',
                            method: function (e) {
                                e.preventDefault();
                                $(this).trigger('click');
                                return false;
                            }
                        }
                    }
                );
            }
        }
    }

    /**
     * Utility to communicate the URL of all jQuery ajax calls back to native app
     * Toggle on with "debugAjax" option
     */
    function debugAjax() {
        if (!window.$) {
            setTimeout(debugAjax, 5);
            return;
        }

        var ajax = $.ajax;

        $.ajax = function () {
            var cb = arguments[0].callback || function () {},
                time = new Date(),
                url = arguments[0].url,
                args = Array.prototype.slice.call(arguments);

            window.IdaMobileAppBrowsing.postToNativeApp(
                "log",
                {message: "Ajax url: " + url}
            );

            var a = ajax.apply($, args);

            a.done(function () {
                console.log("Elapsed " + ((new Date()) - time) + "ms - " + url);
                cb.apply(this, arguments);
            });

            return a;
        }
    }

    /**
     * Send console output to native app
     * Most of the time console log is just 1 string
     * but if not, send everything that was logged
     *
     * it'd be nice if this weren't so repetitive... oh well
     */
    var _consoleLog = console.log;
    console.log = function () {
        var args = Array.prototype.slice.call(arguments, 0),
            message;

        if (args.length === 1 && typeof arguments[0] === "string") {
            message = "Console log - " + arguments[0];
        } else {
            try {
                message = JSON.stringify(args);
            } catch (e) {
                message = "Couldn't parse logged object."
            }
        }

        window.IdaMobileAppBrowsing.postToNativeApp("log", {message: message});

        return _consoleLog.apply(console, arguments);
    };

    var _consoleWarn = console.warn;
    console.warn = function () {
        var args = Array.prototype.slice.call(arguments, 0),
            message;

        if (args.length === 1 && typeof arguments[0] === "string") {
            message = "Console warn - " + arguments[0];
        } else {
            try {
                message = JSON.stringify(args);
            } catch (e) {
                message = "Couldn't parse logged object."
            }
        }

        window.IdaMobileAppBrowsing.postToNativeApp("log", {message: message});

        return _consoleWarn.apply(console, arguments);
    };

    var _consoleErr = console.error;
    console.error = function () {
        var args = Array.prototype.slice.call(arguments, 0),
            message;

        if (args.length === 1 && typeof arguments[0] === "string") {
            message = "Console error - " + arguments[0];
        } else {
            try {
                message = JSON.stringify(args);
            } catch (e) {
                message = "Couldn't parse logged object."
            }
        }

        window.IdaMobileAppBrowsing.postToNativeApp("log", {message: message});

        return _consoleErr.apply(console, arguments);
    };
}
