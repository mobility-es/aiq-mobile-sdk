'use strict';

var colors = require('colors'),
    Q = require('q'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    EOL = require('os').EOL;

colors.setTheme({
    silly: 'rainbow',
    input: 'grey',
    verbose: 'cyan',
    info: 'green',
    help: 'cyan',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
});

function slice (args, start, end) {
    return Array.prototype.slice.call(args, start, end);
}

function print (type) {
    var preffix = ('>>> ' + type.toUpperCase() + ':')[type] + EOL + "\t";
    return function (args) {
        args = slice(args).map(function (arg) {
            return typeof(arg) === 'string' ? arg.replace(/(\r\n|\n)/g, EOL + "\t") : arg;
        });
        args[0] = preffix + args[0];
        console.log.apply(console, args);
    };
}

exports.slice = slice;

exports.info = function () {
    print('info')(arguments);
};

exports.error = function () {
    print('error')(arguments);
};

exports.readJson = function (filename, defaults) {
    var data;
    if (fs.existsSync(filename)) {
        try {
            data = JSON.parse(fs.readFileSync(filename));
        } catch (err) {
            this.error(err.message);
        }
    }
    return util._extend(defaults, data);
};

exports.writeJson = function (filename, content) {
    var defer = Q.defer(),
        data = content || {};

    fs.writeFile(filename, JSON.stringify(data, null, 2), function (err) {
        if (err) {
            defer.reject(err.message);
        } else {
            defer.resolve(data);
        }
    });

    return defer.promise;
};

exports.packFolder = function (folder, skipMocks, cb) {
    var archiver = require('archiver'),
        filename = path.join(folder, Math.random() + '.zip'),
        output = fs.createWriteStream(filename),
        archive = archiver('zip'),
        src = ['**', '!*.zip'];

    if (skipMocks) {
        src.push('!mock-data');
    }

    output.on('close', function () {
        cb(null, {
            path: filename,
            size: archive.pointer()
        });
    });

    archive.on('error', cb);

    archive.pipe(output);

    archive.bulk([{
        expand: true,
        cwd: folder,
        src: src
    }]);

    archive.finalize();
};

exports.server = function (port, docsRoot) {
    var http = require('http'),
        url = require('url');

    http.createServer(function (request, response) {
        var uri = url.parse(request.url).pathname,
            filename = path.join(docsRoot, uri);
        fs.exists(filename, function (exists) {
            if (!exists) {
                response.writeHead(404, {
                    'Content-Type': 'text/plain'
                });
                response.write('404 Not Found' + EOL);
                response.end();
                return;
            }

            if (fs.statSync(filename).isDirectory()) {
                filename += '/index.html';
            }

            fs.readFile(filename, 'binary', function (err, file) {
                if (err) {
                    response.writeHead(500, {
                        'Content-Type': 'text/plain'
                    });
                    response.write(err + EOL);
                    response.end();
                    return;
                }
                response.writeHead(200);
                response.write(file, 'binary');
                response.end();
            });
        });
    }).on('error', function (err) {
        var msg;
        switch (err.code) {
            case 'EADDRINUSE':
                msg = 'Port ' + port + ' is in use.';
            break;
            case 'EACCES':
                msg = 'Current User is not allowed to open port ' + port + '.';
            break;
            default:
                msg = err.message;
            break;
        }
        exports.error(msg);
    })
    .listen(port, function () {
        exports.info('WebServer successfully started at http://localhost:%d/\nPress <CTRL> + <C> to shutdown.', port);
    });
};
