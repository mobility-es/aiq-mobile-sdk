'use strict';

var
    // Vendors
    request = require('request'),
    rest = require('./restler'),
    Q = require('q'),
    wrench = require('wrench'),
    unzip = require('unzip'),
    fstream = require('fstream'),
    jsesc = require('jsesc'),
    read = require('read'),

    // Native
    fs = require('fs'),
    path = require('path'),
    extend = require('util')._extend,
    os = require('os'),

    // Own
    utils = require('./utils');

function Services (configPath, appPath) {
    this._LATEST_AIQ_URL = 'https://aiq-tool:yetiabah7aneeSe@repo.appeariq.com/nexus/service/local/artifact/maven/content?r=releases&g=com.appearnetworks.aiq&v=LATEST&a=html5-boilerplate&p=zip';  // jshint ignore:line
    this._SKELETON_DIR = path.resolve(__dirname, path.join('..', 'skeleton'));

    this._configPath = configPath;
    this._cwdPath = appPath;

    this.config = utils.readJson(this._configPath, {});

    this._apiPrefixes = {
        logout: '/admin/logout',
        solutions: '/admin/solutions',
        app: '/admin/applications'
    };
}

Services.prototype._readManifest = function (appPath) {
    if (!fs.existsSync(appPath) || !fs.statSync(appPath).isDirectory()) {
        return false;
    }
    this._appPath = appPath;
    this._manifestPath = path.join(this._appPath, 'manifest.json');
    this.manifest = utils.readJson(this._manifestPath, {minJsApiLevel: 1});

    return true;
};

Services.prototype._getUrl = function (type) {
    var suffix = arguments.length > 1 ? utils.slice(arguments, 1).join('/') : '';
    return this.config.baseURL + this._apiPrefixes[type] + (suffix ? '/' + suffix : '');
};

Services.prototype.requestToken = function (authInfo) {
    var that = this;
    return rest.get(authInfo.serverUrl, {query: {orgName: authInfo.orgName}})
        .then(function (orgInfo) {
            if (!orgInfo.links) {
                return that._err('Could not connect to AIQ platform.');
            }
            authInfo.baseURL = orgInfo.links.token.substring(0, orgInfo.links.token.lastIndexOf('/'));
            return rest.post(authInfo.baseURL + '/token', {
                data: {
                    username: authInfo.username,
                    password: authInfo.password,
                    grant_type: 'password',
                    scope: 'admin'
                }
            });
        }, function (err) {
            var msg = 'Could not connect to AIQ platform.';
            if (err === 'not_found') {
                msg = 'Organization not found.';
            }
            return that._err(msg);
        })
        .then(function (data) {
            that.config = {
                serverUrl: authInfo.serverUrl,
                orgName: authInfo.orgName,
                baseURL: authInfo.baseURL,
                accessToken: data.access_token,
                userId: data.user._id,
                username: data.user.username,
                expiresIn: data.expires_in
            };
            return that.config;
        }
    );
};

Services.prototype._processIcon = function (params) {
    var defer = Q.defer();

    if (this.manifest.iconPath) {
        if (this.manifest.iconPath.indexOf('..') === 0) {
            defer.reject('"iconPath" should be relative to the application folder.');
        } else {
            fs.stat(path.join(this._appPath, this.manifest.iconPath), function (err, stat) {
                if (err || !stat.isFile()) {
                    defer.reject('Wrong "iconPath" was given.');
                } else {
                    defer.resolve(params);
                }
            });
        }
    } else {
        defer.resolve(params);
    }

    return defer.promise;
};

Services.prototype._refreshManifest = function () {
    return utils.writeJson(this._manifestPath, this.manifest);
};

Services.prototype._packApp = function () {
    return utils.packFolder(this._appPath, !this.manifest.mock);
};

Services.prototype._getLatestAIQ = function (dest) {
    var defer = Q.defer();

    request(this._LATEST_AIQ_URL)
        .pipe(unzip.Parse())
        .pipe(fstream.Writer(dest))
        .on('close', function () {
            var info = utils.readJson(path.join(dest, 'package.json'));
            defer.resolve({
                apiLevel: parseInt(info.level, 10)
            });
        })
        .on('error', function () {
            defer.reject('Error during retrieving the latest AIQ JS API.');
        });

    return defer.promise;
};

Services.prototype._getSolutionsList = function () {
    return rest.get(this._getUrl('solutions'), {accessToken: this.config.accessToken});
};

// Make it mockable
Services.prototype._read = read;

Services.prototype._selectSolution = function () {
    var defer = Q.defer(),
        rawPrint = utils.print(),
        infoPrint = utils.print('info'),
        that = this;

    this._getSolutionsList()
        .then(function (solutions) {
            solutions = solutions || [];
            if (!solutions.length) {
                defer.reject('Current organization doesn\'t have solutions to which you have access.');
            } else if (solutions.length === 1) {
                infoPrint('Solution [%s] was chosen automatically as only one available.', jsesc(solutions[0].name));
                defer.resolve(solutions[0]._id);
            } else if (solutions.length > 1) {
                infoPrint('Multiple solutions are available:');
                rawPrint();
                solutions.forEach(function (solution, i) {
                    rawPrint('\t[%d] %s', i + 1, jsesc(solution.name));
                });
                rawPrint();

                (function choose () {
                    that._read({
                        default: 1,
                        prompt: '<<<     Please, specify the number of a solution which you want to use:'
                    }, function (err, result) {
                        if (err) {
                            rawPrint();
                            defer.reject('Was interrupted.');
                            return;
                        }
                        var n = parseInt(result, 10);
                        if (!n || n < 1 || n > solutions.length) {
                            choose();
                        } else {
                            defer.resolve(solutions[n - 1]._id);
                        }
                    });
                })();
            }
        }, defer.reject);

    return defer.promise;
};

Services.prototype._sendApp = function (params, id) {
    var that = this,
        data = {};

    if (!this._readManifest(params.path || this._cwdPath)) {
        return this._err('Invalid path.');
    }

    // keep the current Manifest
    this._prevManifest = extend({}, this.manifest);

    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }

    this.manifest.name = params.name || this.manifest.name;
    if (!(this.manifest.name || '').trim()) {
        return this._err('Application name is required.');
    }

    if (params.apiLevel) {
        this.manifest.minJsApiLevel = parseInt(params.apiLevel, 10);
    }

    if (isNaN(this.manifest.minJsApiLevel) || this.manifest.minJsApiLevel < 1 || this.manifest.minJsApiLevel > 65535) {
        return this._err('Api level should be numeric and be in the range 1-65535.');
    }

    if (params.mock) {
        // don't ask why not just a `this.manifest.mock = params.mock === 'true';`...
        switch (params.mock.trim().toLowerCase()) {
            case 'true':
                this.manifest.mock = true;
            break;
            case 'false':
                this.manifest.mock = false;
            break;
            default:
                return this._err('Mock argument should be "true" or "false".');
        }
    }

    return this._processIcon(params)
        .then(function () {
            // Solution Id is needed during a publishing only
            if (!id) {
                return that._selectSolution();
            }
        })
        .then(function (solutionId) {
            if (!id && solutionId) {
                data.solutionId = solutionId;
            }
        })
        .then(this._refreshManifest.bind(this))
        .then(this._packApp.bind(this))
        .then(function (file) {
            var request = id ? rest.put : rest.post;

            data.file = rest.file(file.path, 'app.zip', file.size);

            return request(that._getUrl('app', id), {
                multipart: true,
                accessToken: that.config.accessToken,
                data: data
            }).fin(function () {
                // Cleanup
                fs.unlinkSync(file.path);
            });
        })
        .then(function (result) {
            return {
                id: result._id || id,
                name: that.manifest.name
            };
        }, function (err) {
            if (err === 'invalid_token') {
                err = 'Session is expired. Please login again. See \'aiq login -h\'.';
            }
            // Restore Manifest in case of error
            if (that._prevManifest) {
                that.manifest = that._prevManifest;
                that._refreshManifest();
            }
            return that._err(err);
        }
    );
};

/**
 * Connect to the specific IA and store AccessToken
 *
 * @param  {Object} params              Parameters of a connection
 * @return {String} params.serverUrl    IA Server Address
 * @return {String} params.orgName      Name of the Organization
 * @return {String} params.username     Username
 * @return {String} params.password     Password
 */
Services.prototype.login = function (params) {
    var that = this;

    if (!params.orgName) {
        return this._err('Organization Name is required.');
    }
    if (!params.username) {
        return this._err('Username is required.');
    }
    if (!params.password) {
        return this._err('Password is required.');
    }

    return this.requestToken(params)
        .then(function (data) {
            return utils.writeJson(that._configPath, data);
        }
    );
};

/**
 * Destroy current AccessToken
 */
Services.prototype.logout = function () {
    var that = this;

    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }

    return rest.postJson(this._getUrl('logout'), {}, {accessToken: this.config.accessToken})
        .then(function () {
            // Clean up config file
            return utils.writeJson(that._configPath, {});
        }, function (err) {
            if (err === 'invalid_token') {
                err = 'Session is expired. Please login again. See \'aiq login -h\'.';
            }
            return that._err(err);
        }
    );
};

/**
 * Generate HTML5 Application skeleton
 *
 * @param  {String} name        Name of the application
 * @param  {Object} params      Parameters of the application
 * @param  {String} params.path     Path to the workspace
 * @param  {Number} params.apiLevel Minimum Javascript API version required by the application
 */
Services.prototype.generateApp = function (name, params) {
    var that = this,
        workspace = params.path || this._cwdPath,
        appPath;

    this.manifest = {};

    this.manifest.name = (name || '').trim();
    if (!this.manifest.name) {
        return this._err('Application name is required.');
    }

    if (params.apiLevel) {
        this.manifest.minJsApiLevel = parseInt(params.apiLevel, 10);
        if (isNaN(this.manifest.minJsApiLevel) || this.manifest.minJsApiLevel < 1 || this.manifest.minJsApiLevel > 65535) {
            return this._err('Api level should be numeric and be in the range 1-65535.');
        }
    }

    try {
        appPath = path.join(workspace, this.manifest.name);
        if (wrench.copyDirSyncRecursive(this._SKELETON_DIR, appPath)) {
            return this._err('Folder [' + appPath + '] already exists.');
        }
    } catch (e) {
        return this._err('Workspace Path is not writable or does\'nt exist.');
    }

    return this._getLatestAIQ(path.join(appPath, 'aiq'))
        .then(function (data) {
            if (!that.manifest.minJsApiLevel) {
                that.manifest.minJsApiLevel = data.apiLevel;
            }
            return utils.writeJson(path.join(appPath, 'manifest.json'), that.manifest);
        })
        .then(function () {
            return {
                name: name,
                apiLevel: that.manifest.minJsApiLevel
            };
        });
};

/**
 * Register and deploy the new HTML5 Application
 *
 * @param  {Object} params      Parameters of the application, if not provided values from the manifest file will be used
 * @param  {String} params.path     Path to the application
 * @param  {String} params.name     Name of the application
 * @param  {Number} params.apiLevel Minimum Javascript API version required by the application
 * @param  {Boolean} params.mock    Run application in mock mode, default is False
 */
Services.prototype.registerApp = function (params) {
    return this._sendApp(params);
};

/**
 * Update existent HTML5 Application
 *
 * @param  {String} id          Application ID
 * @param  {Object} params      Parameters of the application, if not provided values from the manifest file will be used
 * @param  {String} params.path     Path to the application
 * @param  {String} params.name     Name of the application
 * @param  {Number} params.apiLevel Minimum Javascript API version required by the application
 * @param  {Boolean} params.mock    Run application in mock mode, default is False
 */
Services.prototype.updateApp = function (id, params) {
    var that = this;
    if (id) {
        id = encodeURIComponent(id);
    }
    return this._sendApp(params, id)
        .fail(function (err) {
            //HACK: don't ask why...
            if (err === 'not_found') {
                err = 'Application with ID: ' + id + ' was not found.';
            }
            return that._err(err);
        });
};

/**
 * Unregister existent HTML5 Application
 *
 * @param  {String} id      Application ID
 */
Services.prototype.deleteApp = function (id) {
    var that = this;

    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }

    return rest.del(this._getUrl('app', encodeURIComponent(id)), {accessToken: this.config.accessToken})
        .then(function () {
            return {id: id};
        }, function (err) {
            if (err === 'not_found') {
                err = 'Application with ID: ' + id + ' was not found.';
            } else if (err === 'invalid_token') {
                err = 'Session is expired. Please login again. See \'aiq login -h\'.';
            }
            return that._err(err);
        });
};

/**
 * Show list of registered HTML5 Applications
 */
Services.prototype.getAppsList = function () {
    var that = this,
        result = [];
    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }
    return rest.get(this._getUrl('app'), {accessToken: this.config.accessToken})
        .then(function (data) {
            result = data;
        })
        .then(this._getSolutionsList.bind(this))
        .then(function (solutions) {
            if (solutions && solutions.length) {
                result.forEach(function (app) {
                    app.solution = {};
                    if (app.solutionId) {
                        for (var i = solutions.length - 1; i > -1; i--) {
                            if (solutions[i]._id === app.solutionId) {
                                app.solution = solutions[i];
                                break;
                            }
                        }
                    }
                });
            }
            return result;
        })
        .fail(function (err) {
            if (err === 'invalid_token') {
                err = 'Session is expired. Please login again. See \'aiq login -h\'.';
            }
            return that._err(err);
        });
};

/**
 * Return info about current session
 *
 * @return {Object} Session's info
 */
Services.prototype.getInfo = function () {
    return this.config.accessToken ? this.config : null;
};

/**
 * Start local WebServer
 *
 * @param  {Number} port Port Number
 *
 * @return {Void}
 */
Services.prototype.server = function (port, docsRoot) {
    return utils.server(port, docsRoot || this._cwdPath);
};

Services.prototype._err = function (msg) {
    return Q.fcall(function () {
        throw msg;
    });
};

module.exports = Services;
