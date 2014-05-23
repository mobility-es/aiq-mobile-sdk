'use strict';

var
    // Vendors
    rest = require('./restler'),
    Q = require('q'),

    // Native
    fs = require('fs'),
    path = require('path'),
    extend = require('util')._extend,

    // Own
    utils = require('./utils');

function Services (configPath, appPath) {
    this._configPath = configPath;

    this.config = utils.readJson(this._configPath, {});

    this._apiPrefixes = {
        logout: '/admin/logout',
        app: '/admin/applications'
    };

    this._readManifest(appPath);
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
        }, function () {
            return that._err('Could not connect to AIQ platform.');
        })
        .then(function (data) {
            that.config = {
                baseURL: authInfo.baseURL,
                accessToken: data.access_token,
                userId: data.user._id
            };
            return that.config;
        }, function (err) {
            //HACK: don't ask why...
            if (err === 'not_found') {
                err = 'Organization not found.';
            }
            return that._err(err);
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

Services.prototype._sendApp = function (params, id) {
    var that = this;

    // keep the current Manifest
    this._prevManifest = extend({}, this.manifest);

    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }

    this.manifest.name = params.name || this.manifest.name;
    if (!this.manifest.name) {
        return this._err([
            'Could not find the application name in the manifest file.\n\t' +
            'Please specify the application name.'
        ]);
    }

    if (params.apiLevel) {
        if (isNaN(params.apiLevel)) {
            return this._err('Api level should be numeric.');
        } else {
            this.manifest.minJsApiLevel = parseInt(params.apiLevel, 10);
        }
    }

    this.manifest.mock = !!params.mock;

    return this._processIcon(params)
        .then(this._refreshManifest.bind(this))
        .then(this._packApp.bind(this))
        .then(function (file) {
            var request = id ? rest.put : rest.post,
                data = {
                    file: rest.file(file.path, 'app.zip', file.size)
                };

            if (!params.global) {
                data.userId = that.config.userId;
            }

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
        }
    );
};

/**
 * Register and deploy the new HTML5 Application
 *
 * @param  {String} path        Path to the application
 * @param  {Object} params      Parameters of the application, if not provided values from the manifest file will be used
 * @param  {String} params.name     Name of the application
 * @param  {Number} params.apiLevel Minimum Javascript API version required by the application
 * @param  {Boolean} params.mock    Run application in mock mode, default is False
 * @param  {Boolean} params.global  Make application available to all users, default is False
 */
Services.prototype.registerApp = function (path, params) {
    params = params || {};

    if (path) {
        if (!this._readManifest(path)) {
            return this._err('Invalid path.');
        }
    }

    return this._sendApp(params);
};

/**
 * Update existent HTML5 Application
 *
 * @param  {String} id          Application ID
 * @param  {String} path        Path to the application
 * @param  {Object} params      Parameters of the application, if not provided values from the manifest file will be used
 * @param  {String} params.name     Name of the application
 * @param  {Number} params.apiLevel Minimum Javascript API version required by the application
 * @param  {Boolean} params.mock    Run application in mock mode, default is False
 * @param  {Boolean} params.global  Make application available to all users, default is False
 */
Services.prototype.updateApp = function (id, path, params) {
    var that = this;

    params = params || {};

    if (path) {
        if (!this._readManifest(path)) {
            return this._err('Invalid path.');
        }
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
 * @param  {String} path    Path to the application
 */
Services.prototype.deleteApp = function (id, path) {
    var that = this;

    if (path) {
        if (!this._readManifest(path)) {
            return this._err('Invalid path.');
        }
    }

    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }

    return rest.del(this._getUrl('app', id), {accessToken: this.config.accessToken})
        .then(function () {
            return {id: id};
        }, function (err) {
            //HACK: don't ask why...
            if (err === 'not_found') {
                err = 'Application with ID: ' + id + ' was not found.';
            }
            return that._err(err);
        });
};

/**
 * Show list of registered HTML5 Applications
 */
Services.prototype.getAppsList = function () {
    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }
    return rest.get(this._getUrl('app'), {accessToken: this.config.accessToken});
};

/**
 * Start local WebServer
 *
 * @param  {Number} port Port Number
 *
 * @return {Void}
 */
Services.prototype.server = function (port, docsRoot) {
    return utils.server(port, docsRoot || this._appPath);
};

Services.prototype._err = function (msg) {
    return Q.fcall(function () {
        throw msg;
    });
};

module.exports = Services;
