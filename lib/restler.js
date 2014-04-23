/**
 * @original https://github.com/troupe/restler-q
 */
'use strict';

var rest = require('restler');
var Q = require('q');

function wrap (r) {
    var defer = Q.defer();

    r.on('success', defer.resolve);
    r.on('fail', function (result) {
        defer.reject(result.error_description || result.error);
    });
    r.on('error', function (err) {
        if (err instanceof Error) {
            defer.reject(err.message);
        }
    });
    r.on('abort', function () {
        defer.reject(new Error('Operation aborted'));
    });

    return defer.promise;
}

function wrapMethod (method) {
    return function () {
        var request = method.apply(rest, arguments);
        return wrap(request);
    };
}

module.exports = ['get', 'post', 'put', 'del', 'head', 'json', 'postJson'].reduce(function (memo, method) {
    var underlying = rest[method];
    if (underlying) {
        memo[method] = wrapMethod(underlying);
    }
    return memo;
}, {});

module.exports.file = rest.file;
