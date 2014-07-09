'use strict';

var utils = require('../lib/utils'),
    fs = require('fs');

module.exports = {
    server: {
        'Should validate Port number': {
            nan: function (test) {
                utils.server('a1').then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Port number should be in the range 1-65535.');
                    test.done();
                });
            },
            min: function (test) {
                utils.server(-1).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Port number should be in the range 1-65535.');
                    test.done();
                });
            },
            max: function (test) {
                utils.server(65536).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Port number should be in the range 1-65535.');
                    test.done();
                });
            },
        },
        'Should validate Path': {
            setUp: function (done) {
                this._statSync = fs.statSync;
                this._existsSync = fs.existsSync;
                fs.statSync = function (ret) {
                    fs.statSync = function () {
                        return ret;
                    };
                };
                fs.existsSync = function (ret) {
                    fs.existsSync = function () {
                        return ret;
                    };
                };
                done();
            },
            tearDown: function (done) {
                fs.statSync = this._statSync;
                fs.existsSync = this._existsSync;
                done();
            },
            existence: function (test) {
                fs.existsSync(false);
                utils.server(8080, '/nonexistent').then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Invalid path.');
                    test.done();
                });
            },
            type: function (test) {
                fs.existsSync(true);
                fs.statSync({
                    isDirectory: function () {
                        return false;
                    }
                });
                utils.server(8080, '/existent/but/not_a_folder').then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Invalid path.');
                    test.done();
                });
            },
            'index.html': function (test) {
                fs.existsSync(true);
                fs.statSync({
                    isDirectory: function () {
                        return true;
                    },
                    isFile: function () { //index.html check (hack)
                        return false;
                    }});
                utils.server(8080, '/existent/but/no_index.html').then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Path doesn\'t contain index.html.');
                    test.done();
                });
            }
        }
    }
};
