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

    /**
     * Delayed initialization for after DOM ready
     * Equivalent to documentReady from jQuery
     */
    document.addEventListener("DOMContentLoaded", function (e) {
        window.IdaMobileAppBrowsing.launchApp();
    });

    /**
     * Send console output to native app
     * Most of the time console log is just 1 string
     * but if not, send everything that was logged
     */
    var _consoleLog = console.log;
    console.log = function() {
        var args = Array.prototype.slice.call(arguments, 0),
            message = args;

        if (args.length === 1 && typeof arguments[0]  === "string") {
            message =  "Console log - " + arguments[0];
        }

        window.IdaMobileAppBrowsing.postToNativeApp("log", {message: message});

        return _consoleLog.apply(console, arguments);
    }

    /**
     * WebWrapper module contains all webview wrapper functionality
     *
     * @param opts {{
        appName: string
        css_class: string
        oauthToken: string
        debugAjax: bool
        isWrapperApp: bool
        version: string
        server: string
       }}
     * @returns WebWrapper
     * @constructor
     */
    function WebWrapper(opts) {

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
             * Set/update oauth token
             * @param token
             * @returns {*}
             */
            setToken: function (token) {
                return this.token = token
            },

            /**
             * Bool test if this is the iOS webwrapper
             */
            isIOS: !!window.webkit && !!window.webkit.messageHandlers[opts.appName],

            /**
             * Bool test if this is android webwrapper
             * TODO warrington -- add test for android
             */
            isAndroid: false,

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
             * @param message {String}
             * @param payload {{}}
             */
            postToNativeApp: function (type, data) {
                var payload = {
                    type: type,
                    data: data
                };

                if (this.isIOS) {
                    window.webkit.messageHandlers[opts.appName].postMessage(payload);
                } else if (this.isAndroid) {
                    //TODO Warrington - post payload object to android code
                }
            },

            /**
             * Perform native-initiated navigation via ajax call for speed
             */
            ajaxNavigation: function (url) {
                var $page = $('.page');

                $page.hide();

                $.publish(
                    'ajax/load',
                    {
                        url: url,
                        callback: function () {
                            $page.show();
                        }
                    }
                );
            },

            /**
             * Opens the push navigation menu (hamburger menu)
             */
            showNavigation: function () {
                $.publish('mlpushmenu/toggle');
            },

            /**
             * On document ready logic
             */
            launchApp: function () {
                var self = this;

                if (opts.css_class) {
                    $(document.documentElement).addClass(opts.css_class);
                }

                // Inform native app of document ready and whether we are logged in
                this.postToNativeApp('docready');

                //Now that publish is available, notify web JS that app browsing is active
                $.publish('idaMobileApp/load', opts.appName);

                //Forgot password screen: notify user in native app to check their email after resetting PW
                $(document.body).on(
                    'click',
                    '#backSent',
                    function (e) {
                        e.preventDefault();

                        self.postToNativeApp(
                            'alert',
                            {message: "Check your email"}
                        )

                        self.postToNativeApp(
                            "navigate",
                            {navigate: "back"}
                        );
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
            IdaMobileAppBrowsing.postToNativeApp(
                "log",
                {message: "Ajax url: " + arguments[0].url}
            );
            return ajax.apply($, arguments);
        }
    }
}