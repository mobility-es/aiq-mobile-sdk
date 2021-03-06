'use strict';

var os = require('os'),
    Q = require('q'),
    fs = require('fs'),
    wrench = require('wrench'),
    restler = require('restler'),

    rest = require('../lib/restler'),
    utils = require('../lib/utils'),
    Services = require('../lib/services'),

    STORAGE = {};

module.exports = {
    setUp: function (done) {
        STORAGE = {
            '/configPath': {
                baseURL: 'http://server.name',
                accessToken: 'valid_one'
            },
            '/configPathGuest': {},
            '/appPath/manifest.json': {},
            '/appPathWrongIcon1/manifest.json': {
                iconPath: 'blabla.png'
            },
            '/appPathWrongIcon2/manifest.json': {
                iconPath: '../etc/passwd'
            },
        };

        this._readJson = utils.readJson;
        this._writeJson = utils.writeJson;
        utils.readJson = function (key) {
            return STORAGE[key];
        };
        utils.writeJson = function (key, content) {
            STORAGE[key] = content;
            return Q.fcall(function () {
                return content;
            });
        };
        this.services = new Services('/configPath', '/appPath');
        done();
    },
    tearDown: function (done) {
        utils.readJson = this._readJson;
        utils.writeJson = this._writeJson;
        done();
    },

    _readManifest: function (test) {
        var _statSync = fs.statSync,
            _existsSync = fs.existsSync;

        fs.existsSync = function () {
            return false;
        };
        test.equal(this.services._readManifest('/nonexistent'), false);
        fs.existsSync = function () {
            return true;
        };
        fs.statSync = function () {
            return {
                isDirectory: function () {
                    return false;
                }
            };
        };
        test.equal(this.services._readManifest('/existent/but/not_a_folder'), false);

        fs.statSync = _statSync;
        fs.existsSync = _existsSync;

        test.done();
    },

    _getUrl: function (test) {
        test.equal(this.services._getUrl('app'), 'http://server.name/admin/applications');
        test.equal(this.services._getUrl('app', 123, 321), 'http://server.name/admin/applications/123/321');
        test.done();
    },

    _selectSolution: {
        setUp: function (done) {
            this._getSolutionsList = this.services._getSolutionsList;
            this._read = this.services._read;
            this._print = utils.print;
            done();
        },
        tearDown: function (done) {
            this.services._getSolutionsList = this._getSolutionsList;
            this.services._read = this._read;
            utils.print = this._print;
            done();
        },
        'Should return error message if there are no solutions': function (test) {
            this.services._getSolutionsList = function () {
                return Q.fcall(function () {
                    return;
                });
            };
            this.services._selectSolution().then(function () {
                test.ifError(true);
                test.done();
            }, function (data) {
                test.equal(data, 'You do not have access to any solution.');
                test.done();
            });
        },
        'Should automatically choose Solution if there only one is available': function (test) {
            var output;
            utils.print = function () {
                return function () {
                    output = [].slice.call(arguments);
                };
            };
            this.services._getSolutionsList = function () {
                return Q.fcall(function () {
                    return [{
                        name: 'bla',
                        _id: 'dla'
                    }];
                });
            };
            this.services._selectSolution().then(function (data) {
                test.equal(output[0], 'The app was published to the solution [%s].');
                test.equal(output[1], 'bla');
                test.equal(data, 'dla');
                test.done();
            }, function () {
                test.ifError(true);
                test.done();
            });
        },
        'Should read stdin if there are more than one Solutions available': function (test) {
            var outputs = [];

            utils.print = function () {
                return function () {
                    outputs.push([].slice.call(arguments));
                };
            };

            this.services._read = function (params, cb) {
                cb(null, 2);
            };

            this.services._getSolutionsList = function () {
                return Q.fcall(function () {
                    return [{
                        name: 'zoo',
                        _id: 'maz'
                    }, {
                        name: 'bar',
                        _id: 'baz'
                    }];
                });
            };

            this.services._selectSolution().then(function (data) {
                test.equal(outputs[0][0], 'What solution do you want to publish the app to:');
                test.equal(outputs[1][0], null);

                // Should be sorted alphabetically
                test.deepEqual(outputs[2], ['\t[%d] %s', 1, 'bar']);
                test.deepEqual(outputs[3], ['\t[%d] %s', 2, 'zoo']);

                test.equal(outputs[4][0], null);

                test.equal(data, 'maz');
                test.done();
            }, function () {
                test.ifError(true);
                test.done();
            });
        }
    },

    requestToken: {
        'Should double-check the response': function (test) {
            var _get = rest.get;
            rest.get = function () {
                return Q.fcall(function () {
                    return '<html>Invalid Server</html>';
                });
            };
            this.services.requestToken({orgName: 1}).then(function () {
                rest.get = _get;
                test.ifError(true);
                test.done();
            }, function (data) {
                rest.get = _get;
                test.equal(data, 'Could not connect to AIQ platform.');
                test.done();
            });
        },
        'Should return custom error messages': {
            generic: function (test) {
                var _get = rest.get;
                rest.get = function () {
                    return Q.fcall(function () {
                        throw 'Internal Sever Error';
                    });
                };
                this.services.requestToken({orgName: 1}).then(function () {
                    rest.get = _get;
                    test.ifError(true);
                    test.done();
                }, function (data) {
                    rest.get = _get;
                    test.equal(data, 'Could not connect to AIQ platform.');
                    test.done();
                });
            },
            not_found: function (test) {
                var _get = rest.get;
                rest.get = function () {
                    return Q.fcall(function () {
                        throw 'not_found';
                    });
                };
                this.services.requestToken({orgName: 1}).then(function () {
                    rest.get = _get;
                    test.ifError(true);
                    test.done();
                }, function (data) {
                    rest.get = _get;
                    test.equal(data, 'Organization not found.');
                    test.done();
                });
            }
        },
        'Should return proper Data structure in case of success': function (test) {
            var _get = rest.get,
               _post = rest.post;

            rest.get = function () {
                return Q.fcall(function () {
                    return {
                        links: {
                            token: 'http://server.name/api/org/some_id/token'
                        }
                    };
                });
            };
            rest.post = function (url, data) {
                test.equal(url, 'http://server.name/api/org/some_id/token');
                test.deepEqual(data, {
                    data: {
                        username: 2,
                        password: 3,
                        grant_type: 'password',
                        scope: 'admin'
                    }
                });
                return Q.fcall(function () {
                    return {
                        access_token: 'token',
                        user: {
                            _id: 999,
                            username: 'username'
                        },
                        expires_in: 888
                    };
                });
            };

            this.services.requestToken({orgName: 1, username: 2, password: 3, serverUrl: 'http://server.name/api'}).then(function (data) {
                rest.get = _get;
                rest.post = _post;
                test.deepEqual(data, {
                    serverUrl: 'http://server.name/api',
                    orgName: 1,
                    baseURL: 'http://server.name/api/org/some_id',
                    accessToken: 'token',
                    userId: 999,
                    username: 'username',
                    expiresIn: 888
                });
                test.done();
            }, function () {
                rest.get = _get;
                rest.post = _post;
                test.ifError(true);
                test.done();
            });
        }
    },

    _processIcon: {
        'Should validate the iconPath to be within the App folder': function (test) {
            var services = new Services('/configPathGuest');
            //HACK
            services.manifest = STORAGE['/appPathWrongIcon2/manifest.json'];
            services._processIcon({}).then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, '"iconPath" should be relative to the application folder.');
                test.done();
            });
        },
        'Should validate existence of a file': function (test) {
            var services = new Services('/configPathGuest');
            //HACK
            services._appPath = '/appPathWrongIcon1';
            services.manifest = STORAGE['/appPathWrongIcon1/manifest.json'];
            services._processIcon({}).then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Wrong "iconPath" was given.');
                test.done();
            });
        },
        'Should pass if iconPath was not specified': function (test) {
            var that = this;
            this.services.manifest = {};
            this.services._processIcon({}).then(function () {
                that.services.manifest = null;
                test.ok(true);
                test.done();
            }, function () {
                that.services.manifest = null;
                test.ifError(true);
                test.done();
            });
        }
    },

    _sendApp: {
        'Should validate Path': function (test) {
            this.services._sendApp({path: '/invalid-path'}).then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Invalid path.');
                test.done();
            });
        },
        'Should check auth status': function (test) {
            var services = new Services('/configPathGuest', '/appPath');
            services._readManifest = function () {
                return true;
            };
            services._sendApp({}).then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Client doesn\'t seem to be authorized.');
                test.done();
            });
        },
        'Should validate App Name': {
            params: function (test) {
                var services = new Services('/configPath', '/appPath');
                services._readManifest = function () {
                    this.manifest = {name: '123'};
                    return true;
                };
                services._sendApp({name: '      '}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Application name is required.');
                    test.done();
                });
            },
            manifest: function (test) {
                var services = new Services('/configPath', '/appPath');
                services._readManifest = function () {
                    this.manifest = {name: '     '};
                    return true;
                };
                services._sendApp({}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Application name is required.');
                    test.done();
                });
            }
        },
        'Should validate API level': {
            nan: function (test) {
                var services = new Services('/configPath', '/appPath');
                services._readManifest = function () {
                    this.manifest = {};
                    return true;
                };
                services._sendApp({name: '123', apiLevel: 'a'}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Api level should be numeric and be in the range 1-65535.');
                    test.done();
                });
            },
            min: function (test) {
                var services = new Services('/configPath', '/appPath');
                services._readManifest = function () {
                    this.manifest = {};
                    return true;
                };
                services._sendApp({name: '123', apiLevel: -1}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Api level should be numeric and be in the range 1-65535.');
                    test.done();
                });
            },
            max: function (test) {
                var services = new Services('/configPath', '/appPath');
                services._readManifest = function () {
                    this.manifest = {};
                    return true;
                };
                services._sendApp({name: '123', apiLevel: 65536}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Api level should be numeric and be in the range 1-65535.');
                    test.done();
                });
            },
        },
        'Should validate Mock param': function (test) {
            var services = new Services('/configPath', '/appPath');
            services._readManifest = function () {
                this.manifest = {minJsApiLevel: 1};
                return true;
            };
            services._sendApp({name: '123', mock: 'truefalse'}).then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Mock argument should be "true" or "false".');
                test.done();
            });
        }
    },

    login: {
        'Should validate input': {
            orgName: function (test) {
                this.services.login({}).then(function() {}, function (data) {
                    test.equal(data, 'Organization Name is required.', 'Should validate orgName');
                    test.done();
                });
            },
            username: function (test) {
                this.services.login({orgName: 1}).then(function() {}, function (data) {
                    test.equal(data, 'Username is required.', 'Should validate username');
                    test.done();
                });
            },
            password: function (test) {
                this.services.login({orgName: 1, username: 2}).then(function () {}, function (data) {
                    test.equal(data, 'Password is required.', 'Should validate password');
                    test.done();
                });
            }
        },
        'Should request token and update Config in case of success': function (test) {
            var that = this,
                _requestToken = this.services.requestToken;
            this.services.requestToken = function (params) {
                return Q.fcall(function () {
                    return params;
                });
            };
            this.services.login({orgName: 1, username: 2, password: 3}).then(function (data) {
                that.services.requestToken = _requestToken;
                test.deepEqual(data, {orgName: 1, username: 2, password: 3});
                test.done();
            }, function () {
                that.services.requestToken = _requestToken;
                test.ifError(true);
                test.done();
            });
        }
    },

    logout: {
        'Should check auth status': function (test) {
            var services = new Services('/configPathGuest', '/appPath');
            services.logout().then(function () {
                test.ifError(true);
            }, function (err) {
                test.equal(err, 'Client doesn\'t seem to be authorized.');
                test.done();
            });
        },
        'Should return custom error message for `invalid_token` response': function (test) {
            var _postJson = rest.postJson;
            rest.postJson = function () {
                return Q.fcall(function () {
                    throw 'invalid_token';
                });
            };
            this.services.logout().then(function () {
                rest.postJson = _postJson;
                test.ifError(true);
                test.done();
            }, function (err) {
                rest.postJson = _postJson;
                test.equal(err, 'Session is expired. Please login again. See \'aiq login -h\'.');
                test.done();
            });
        },
        'Should cleanup the storage in case of success': function (test) {
            var _postJson = rest.postJson;
            rest.postJson = function () {
                return Q.fcall(function () {});
            };
            this.services.logout().then(function (data) {
                rest.postJson = _postJson;
                test.equal(data, undefined);
                test.done();
            }, function () {
                rest.postJson = _postJson;
                test.ifError(true);
                test.done();
            });
        }
    },

    generateApp: {
        'Should validate App Name': function (test) {
            this.services.generateApp('      ', {}).then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Application name is required.');
                test.done();
            });
        },
        'Should validate API level': {
            nan: function (test) {
                this.services.generateApp('123', {apiLevel: 'a'}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Api level should be numeric and be in the range 1-65535.');
                    test.done();
                });
            },
            min: function (test) {
                this.services.generateApp('123', {apiLevel: -1}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Api level should be numeric and be in the range 1-65535.');
                    test.done();
                });
            },
            max: function (test) {
                this.services.generateApp('123', {apiLevel: 65536}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Api level should be numeric and be in the range 1-65535.');
                    test.done();
                });
            },
        },
        'Should validate Path': {
            writable: function (test) {
                this.services.generateApp('some', {path: '/dev'}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Workspace Path is not writable or does\'nt exist.');
                    test.done();
                });
            },
            exists: function (test) {
                this.services.generateApp('tmp', {path: '/'}).then(function () {
                    test.ifError(true);
                    test.done();
                }, function (err) {
                    test.equal(err, 'Folder [/tmp] already exists.');
                    test.done();
                });
            }
        },
        'Should update manifest.json': {
            setUp: function (done) {
                this._copyDirSyncRecursive = wrench.copyDirSyncRecursive;
                this._getLatestAIQ = this.services._getLatestAIQ;
                wrench.copyDirSyncRecursive = function () {
                    return false;
                };
                this.services._getLatestAIQ = function (dest) {
                    return Q.fcall(function () {
                        return {aiq: dest, apiLevel: 999};
                    });
                };
                done();
            },
            tearDown: function (done) {
                this.services._getLatestAIQ = this._getLatestAIQ;
                wrench.copyDirSyncRecursive = this._copyDirSyncRecursive;
                done();
            },

            'put latest apiLevel': function (test) {
                test.equal(typeof STORAGE['/tmp/aaa/manifest.json'], 'undefined');
                this.services.generateApp('aaa', {path: '/tmp'}).then(function (data) {
                    test.deepEqual(STORAGE['/tmp/aaa/manifest.json'], {name: 'aaa', minJsApiLevel: 999});
                    test.deepEqual(data, {name: 'aaa', apiLevel: 999});
                    test.done();
                }, function () {
                    test.ifError(true);
                    test.done();
                });
            },
            'force apiLevel value provided by User': function (test) {
                test.equal(typeof STORAGE['/tmp/aaa/manifest.json'], 'undefined');
                this.services.generateApp('aaa', {path: '/tmp', apiLevel: 111}).then(function (data) {
                    test.deepEqual(STORAGE['/tmp/aaa/manifest.json'], {name: 'aaa', minJsApiLevel: 111});
                    test.deepEqual(data, {name: 'aaa', apiLevel: 111});
                    test.done();
                }, function () {
                    test.ifError(true);
                    test.done();
                });
            },
        }
    },

    updateApp: {
        'Should return custom error message for `not_found` response': function (test) {
            var that = this,
                _sendApp = this.services._sendApp;
            this.services._sendApp = function () {
                return Q.fcall(function () {
                    throw 'not_found';
                });
            };
            this.services.updateApp('/encode me', {}).then(function () {
                that.services._sendApp = _sendApp;
                test.ifError(true);
                test.done();
            }, function (err) {
                that.services._sendApp = _sendApp;
                test.equal(err, 'Application with ID: %2Fencode%20me was not found.');
                test.done();
            });
        }
    },

    deleteApp: {
        'Should check auth status': function (test) {
            var services = new Services('/configPathGuest', '/appPath');
            services.deleteApp(1).then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Client doesn\'t seem to be authorized.');
                test.done();
            });
        },
        'Should return ID in case of Success': function (test) {
            var _del = rest.del;
            rest.del = function (path) {
                test.equal(path, 'http://server.name/admin/applications/%2Fencode%20me', 'ID should be encoded');
                return Q.fcall(function () {});
            };
            this.services.deleteApp('/encode me').then(function (data) {
                rest.del = _del;
                test.deepEqual(data, {id: '/encode me'});
                test.done();
            }, function () {
                rest.del = _del;
                test.ifError(true);
                test.done();
            });
        },
        'Should return custom error message for `invalid_token` response': function (test) {
            var _del = rest.del;
            rest.del = function () {
                return Q.fcall(function () {
                    throw 'invalid_token';
                });
            };
            this.services.deleteApp(1).then(function () {
                rest.del = _del;
                test.ifError(true);
                test.done();
            }, function (err) {
                rest.del = _del;
                test.equal(err, 'Session is expired. Please login again. See \'aiq login -h\'.');
                test.done();
            });
        },
        'Should return custom error message for `not_found` response': function (test) {
            var _del = rest.del;
            rest.del = function () {
                return Q.fcall(function () {
                    throw 'not_found';
                });
            };
            this.services.deleteApp(1).then(function () {
                rest.del = _del;
                test.ifError(true);
                test.done();
            }, function (err) {
                rest.del = _del;
                test.equal(err, 'Application with ID: 1 was not found.');
                test.done();
            });
        }
    },

    getAppsList: {
        setUp: function (done) {
            this._getSolutionsList = this.services._getSolutionsList;
            this._restGet = rest.get;
            done();
        },
        tearDown: function (done) {
            this.services._getSolutionsList = this._getSolutionsList;
            rest.get = this._restGet;
            done();
        },

        'Should check auth status': function (test) {
            var services = new Services('/configPathGuest', '/appPath');
            services.getAppsList().then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Client doesn\'t seem to be authorized.');
                test.done();
            });
        },
        'Should map Solutions to Applications': function (test) {
            rest.get = function () {
                return Q.fcall(function () {
                    return [
                        {_id: '1', solutionId: 's1', name: 'one'},
                        {_id: '3', solutionId: 's3', name: 'three'},
                    ];
                });
            };

            this.services._getSolutionsList = function () {
                return Q.fcall(function () {
                    return [
                        {_id: 's1', name: 'sol1'},
                        {_id: 's2', name: 'sol2'},
                        {_id: 's3', name: 'sol3'}
                    ];
                });
            };

            this.services.getAppsList().then(function (data) {
                test.deepEqual(data, [{
                    _id: '1',
                    solutionId: 's1',
                    solution: {_id: 's1', name: 'sol1'},
                    name: 'one'
                }, {
                    _id: '3',
                    solutionId: 's3',
                    solution: {_id: 's3', name: 'sol3'},
                    name: 'three'
                }
                ]);
                test.done();
            }, function () {
                test.ifError(true);
                test.done();
            });
        },
        'Should return custom error message': function (test) {
            rest.get = function () {
                return Q.fcall(function () {
                    throw 'invalid_token';
                });
            };
            this.services.getAppsList().then(function () {
                test.ifError(true);
                test.done();
            }, function (err) {
                test.equal(err, 'Session is expired. Please login again. See \'aiq login -h\'.');
                test.done();
            });
        }
    },

    getInfo: {
        'Should return Info for authorized client': function (test) {
            test.deepEqual(this.services.getInfo(), {
                baseURL: 'http://server.name',
                accessToken: 'valid_one'
            });
            test.done();
        },
        'Should return nothing for non-authorized client': function (test) {
            var services = new Services('/configPathGuest', '/appPath');
            test.equal(services.getInfo(), null);
            test.done();
        }
    },

    server: {
        'Should use CWD if Path is not provided': function (test) {
            var _server = utils.server;
            utils.server = function (port, path) {
                utils.server = _server;
                test.equal(path, '/appPath');
                test.done();
            };
            this.services.server(1337);
        }
    },

    showLogs: {
        setUp: function (done) {
            this._restlerGet = restler.get;

            this._stubRestlerGet = function (yieldTo, yieldWith) {
                restler.get = function () {
                    this.calledWith = arguments;
                    return {
                        on: function (e, cb) {
                            if (yieldTo && e === yieldTo) {
                                cb.apply(null, yieldWith);
                            }
                            return this;
                        }
                    };
                };
            };

            this._utilsError = utils.error;
            utils.error = function () {
                this.calledWith = arguments;
            };

            this._processExit = process.exit;
            process.exit = function () {
                this._exitCalled = true;
            };

            done();
        },
        tearDown: function (done) {
            restler.get = this._restlerGet;
            utils.error = this._utilsError;
            process.exit = this._processExit;
            done();
        },
        'Should build a proper URL': function (test) {
            this._stubRestlerGet();
            this.services.showLogs('example.com');
            test.equal('http://example.com:8000/logs', restler.calledWith[0]);
            test.done();
        },
        'Should notify User when it is not possible to connect to the container': function (test) {
            this._stubRestlerGet('error');
            this.services.showLogs('0.0.0.0');
            test.equal(utils.calledWith[0],
                'The provided IP address is not reachable or debug mode is not enabled on this device.' + os.EOL +
                'Please make sure your device is accessible and enable the debug mode from container settings page and try again.'
            );
            test.ok(process._exitCalled);
            test.done();
        }
    },

    _err: function (test) {
        this.services._err('some')
            .then(function () {
                test.ifError(true, 'Should not be called');
                test.done();
            }, function (msg) {
                test.equal(msg, 'some');
                test.done();
            });
    }
};
