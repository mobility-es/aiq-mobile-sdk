'use strict';

var colors = require('colors'),
    Q = require('q'),
    extend = require('util')._extend,
    fs = require('fs'),
    path = require('path'),
    os = require('os');

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
    var preffix = ('>>> ' + type.toUpperCase() + ':')[type] + os.EOL + '\t';
    return function () {
        var args = slice(arguments).map(function (arg) {
            return typeof(arg) === 'string' ? arg.replace(/(\r\n|\n)/g, os.EOL + '\t') : arg;
        });
        args[0] = preffix + args[0];
        console.log.apply(console, args);
    };
}

exports.slice = slice;
exports.info = print('info');
exports.error = print('error');

exports.readJson = function (filename, defaults) {
    var data;
    if (fs.existsSync(filename)) {
        try {
            data = JSON.parse(fs.readFileSync(filename, 'utf8'));
        } catch (err) {
            this.error(filename + ': ' + err.message);
            process.exit(1);
        }
    }
    return extend(defaults, data);
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

exports.getUserHome = function () {
    return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
};

exports.packFolder = function (folder, skipMocks) {
    var defer = Q.defer(),
        archiver = require('archiver'),
        filename = Math.random() + '.zip',
        filepath = path.join(os.tmpdir(), filename),
        output = fs.createWriteStream(filepath),
        archive = archiver('zip'),
        src = ['**', '!' + filename];

    if (skipMocks) {
        src.push('!mock-data/**');
    }

    output.on('close', function () {
        var size = archive.pointer();
        //HACK: limit files to 20mb...
        if (size > 1024 * 1024 * 20) {
            fs.unlinkSync(filepath);
            defer.reject('Current version of the Platform doesn\'t support Applications with size bigger than 20MB.');
        } else {
            defer.resolve({
                path: filepath,
                size: size
            });
        }
    });

    archive.on('error', defer.reject);

    archive.pipe(output);

    archive.bulk([{
        expand: true,
        cwd: folder,
        src: src
    }]);

    archive.finalize();

    return defer.promise;
};

exports.server = function (port, docsRoot) {
    var defer = Q.defer(),
        http = require('http'),
        url = require('url');

    port = parseInt(port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        defer.reject('Port number should be in range 1-65535.');
        return defer.promise;
    }

    if (!fs.statSync(docsRoot).isDirectory()) {
        defer.reject('Invalid path.');
        return defer.promise;
    }

    if (!fs.existsSync(path.join(docsRoot, 'index.html'))) {
        defer.reject('Path doesn\'t contain index.html.');
        return defer.promise;
    }

    function err (response, code, text) {
        response.writeHead(code, {'Content-Type': 'text/plain'});
        response.write(text + os.EOL);
        response.end();
    }

    http.createServer(function (request, response) {
        var uri = url.parse(request.url).pathname,
            filename = path.join(docsRoot, uri);
        fs.exists(filename, function (exists) {
            if (!exists) {
                return err(response, 404, '404 Not Found');
            }

            if (fs.statSync(filename).isDirectory()) {
                filename += 'index.html';
                if (!fs.existsSync(filename)) {
                    return err(response, 404, 'index.html Not Found');
                }
            }

            fs.readFile(filename, 'binary', function (err, file) {
                if (err) {
                    err(response, 500, err);
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
        defer.reject(msg);
    }).listen(port, defer.resolve);

    return defer.promise;
};
