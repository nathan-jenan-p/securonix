let async = require('async');
let config = require('./config/config');
let request = require('request');

let Logger;
let requestWithDefaults;
let requestOptions = {};

let NodeCache = require('node-cache');
let tokenCache = new NodeCache({
    stdTTL: 60 * 60
});

function handleRequestError(request) {
    return (options, expectedStatusCode, callback) => {
        return request(options, (err, resp, body) => {
            if (err || resp.statusCode !== expectedStatusCode) {
                Logger.error(`error during http request to ${options.url}`, { error: err, status: resp ? resp.statusCode : 'unknown' });
                callback({ error: err, statusCode: resp ? resp.statusCode : 'unknown' });
            } else {
                callback(null, body);
            }
        });
    };
}

function doLookup(entities, options, callback) {
    // TODO investigate if lookup can be done in 1 query

    Logger.trace('options are: ', options);

    let results = [];

    Logger.trace('about to loop');

    async.forEach(entities, (entity, cb) => {
        Logger.trace('looking up entity ' + entity.value);

        requestWithDefaults(
            {
                url: `${options.host}/spotter/index/search`,
                qs: {
                    query: `index=asset and key_ip = "${entity.value}"`
                },
                headers: {
                    token: options.token
                }
            },
            200,
            (err, body) => {
                if (err) {
                    Logger.trace('err looking up entity ' + entity.value);
                    cb(err);
                    return
                }

                if (!body.events) {
                    Logger.trace('no entity found for query ' + entity.value);
                    results.push({
                        entity: entity,
                        data: null
                    });
                    cb();
                    return;
                }

                Logger.trace('found entity for ' + entity.value, body);
                results.push({
                    entity: entity,
                    data: {
                        summary: [],
                        details: body.events.map(event => {
                            return event.result.entry.reduce((prev, next) => {
                                prev[next.key] = next.value;
                                return prev;
                            }, {});
                        })
                    }
                });       
                cb();
            });
    }, err => {
        callback(err, results);
    });
}

function startup(logger) {
    Logger = logger;

    if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
        requestOptions.cert = fs.readFileSync(config.request.cert);
    }

    if (typeof config.request.key === 'string' && config.request.key.length > 0) {
        requestOptions.key = fs.readFileSync(config.request.key);
    }

    if (typeof config.request.passphrase === 'string' && config.request.passphrase.length > 0) {
        requestOptions.passphrase = config.request.passphrase;
    }

    if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
        requestOptions.ca = fs.readFileSync(config.request.ca);
    }

    if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
        requestOptions.proxy = config.request.proxy;
    }

    if (typeof config.request.rejectUnauthorized === 'boolean') {
        requestOptions.rejectUnauthorized = config.request.rejectUnauthorized;
    }

    requestOptions.json = true;

    requestWithDefaults = handleRequestError(request.defaults(requestOptions));
}

function validateStringOption(errors, options, optionName, errMessage) {
    if (typeof options[optionName].value !== 'string' ||
        (typeof options[optionName].value === 'string' && options[optionName].value.length === 0)) {
        errors.push({
            key: optionName,
            message: errMessage
        });
    }
}

function validateOptions(options, callback) {
    let errors = [];

    validateStringOption(errors, options, 'host', 'You must provide a host.');
    validateStringOption(errors, options, 'token', 'You must provide a token.');
    validateStringOption(errors, options, 'tenant', 'You must provide a tenant ID.');

    callback(null, errors);
}

module.exports = {
    doLookup: doLookup,
    startup: startup,
    validateOptions: validateOptions
};
