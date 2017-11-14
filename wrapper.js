function WebWrapper(opts) {
    this.opts = opts;

    window.IdaMobileAppBrowsing = {
        token: opts.oauthToken
    };
}