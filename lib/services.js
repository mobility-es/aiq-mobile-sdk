'use strict';

var
    // Vendors
    rest = require('./restler'),
    Q = require('q'),
    inquirer = require('inquirer'),

    // Native
    fs = require('fs'),
    path = require('path'),

    // Own
    utils = require('./utils');

function Services (configPath, appPath) {
    this._configPath = configPath;
    this._appPath = appPath;
    this._manifestPath = path.join(this._appPath, 'manifest.json');

    this.config = utils.readJson(this._configPath, {});
    this.manifest = utils.readJson(this._manifestPath, {minJsApiLevel: 0});

    this._apiPrefixes = {
        logout: '/admin/logout',
        app: '/admin/applications'
    };
}

Services.prototype._getUrl = function (type) {
    var suffix = arguments.length > 1 ? utils.slice(arguments, 1).join('/') : '';
    return this.config.baseURL + this._apiPrefixes[type] + (suffix ? '/' + suffix : '');
};

Services.prototype.requestToken = function (authInfo) {
    var that = this;
    return rest.get(authInfo.serverUrl, {query: {orgName: authInfo.orgName}})
        .then(function (orgInfo) {
            authInfo.baseURL = orgInfo.links.token.substring(0, orgInfo.links.token.lastIndexOf('/'));
            return rest.post(authInfo.baseURL + '/token', {
                data: {
                    username: authInfo.username,
                    password: authInfo.password,
                    grant_type: 'password',
                    scope: 'admin'
                }
            });
        })
        .then(function (data) {
            that.config = {
                baseURL: authInfo.baseURL,
                accessToken: data.access_token,
                userId: data.user._id
            };
            return that.config;
        }
    );
};

Services.prototype._processIcon = function (params) {
    var defer = Q.defer();

    if (this.manifest.iconPath) {
        fs.stat(path.join(this._appPath, this.manifest.iconPath), function (err, stat) {
            if (err || !stat.isFile()) {
                defer.reject('Wrong "iconPath" was given.');
            } else {
                defer.resolve(params);
            }
        });
    } else {
        defer.resolve(params);
    }

    return defer.promise;
};

Services.prototype._processType = function (params) {
    var that = this,
        defer = Q.defer();

    if (params.type !== 'update' && this.manifest.id) {
        inquirer.prompt({
            type: 'confirm',
            name: 'overwrite',
            message: 'App is already registered with ID: ' + this.manifest.id +
                     '.\n\tAre you sure you want to overwrite it?',
            'default': false
        }, function (answers) {
            if (answers.overwrite) {
                delete that.manifest.id;
                defer.resolve(params);
            }
        });
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

Services.prototype._sendApp = function (params) {
    var that = this;
    this._prevManifest = this.manifest;
    if (params.apiLevel) {
        this.manifest.minJsApiLevel = params.apiLevel;
    }
    if (params.mock) {
        this.manifest.mock = params.mock;
    }
    return this._processIcon(params)
        .then(this._processType.bind(this))
        .then(this._refreshManifest.bind(this))
        .then(this._packApp.bind(this))
        .then(function (file) {
            var request = params.type === 'update' ? rest.put : rest.post,
                data = {
                    file: rest.file(file.path, 'app.zip', file.size)
                };

            if (!params.global) {
                data.userId = that.config.userId;
            }

            return request(that._getUrl('app', that.manifest.id), {
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
                id: result._id || that.manifest.id,
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
 * @param  {String} name        Name of the application
 * @param  {Object} params      Parameters of the application, if not provided values from the manifest file will be used
 * @param  {Number} params.apiLevel Minimum Javascript API version required by the application
 * @param  {Boolean} params.mock    Run application in mock mode, default is False
 * @param  {Boolean} params.global  Make application available to all users, default is False
 */
Services.prototype.registerApp = function (name, params) {
    var that = this;

    params = params || {};

    this.manifest.name = name || this.manifest.name;
    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }
    if (!this.manifest.name) {
        return this._err('Application Name is required.');
    }

    params.type = 'create';
    return this._sendApp(params)
        .then(function (data) {
            // Put new ID to the manifest
            that.manifest.id = data.id;
            return that._refreshManifest();
        }
    );
};

/**
 * Update existent HTML5 Application
 *
 * @param  {Object} params      Parameters of the application, if not provided values from the manifest file will be used
 * @param  {Number} params.apiLevel Minimum Javascript API version required by the application
 * @param  {Boolean} params.mock    Run application in mock mode, default is False
 * @param  {Boolean} params.global  Make application available to all users, default is False
 */
Services.prototype.updateApp = function (params) {
    params = params || {};

    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }
    if (!this.manifest.id) {
        return this._err('Application is not registered yet');
    }
    if (!this.manifest.name) {
        return this._err('Application Name is required.');
    }

    params.type = 'update';
    return this._sendApp(params);
};

/**
 * Unregister existent HTML5 Application
 *
 * @param  {Object} params
 * @param  {String} params.id Application ID (optional, ID from the manifest file will be used by default)
 */
Services.prototype.deleteApp = function (params) {
    params = params || {};

    var that = this,
        id = params.id || this.manifest.id;

    if (!this.config.accessToken) {
        return this._err('Client doesn\'t seem to be authorized.');
    }
    if (!id) {
        return this._err('Application ID is required.');
    }

    return rest.del(this._getUrl('app', id), {accessToken: this.config.accessToken})
        .then(function () {
            if ((params.id && params.id === that.manifest.id) || (!params.id && that.manifest.id)) {
                delete that.manifest.id;
                // Remove ID from the manifest
                return utils.writeJson(that._manifestPath, that.manifest);
            } else {
                return that.manifest;
            }
        })
        .then(function () {
            return {id: id};
        }
    );
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
Services.prototype.server = function (port) {
    return utils.server(port, this._appPath);
};

Services.prototype._err = function (msg) {
    return Q.fcall(function () {
        throw msg;
    });
};

module.exports = Services;
