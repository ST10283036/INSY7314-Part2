const helmet = require("helmet");

module.exports = helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
        },
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false, preload: false },
    xFrameOptions: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
});
