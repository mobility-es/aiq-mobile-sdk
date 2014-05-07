'use strict';

var Command = require('commander').Command;

//HACK: monkeypath it :(

Command.prototype.note = function(str){
    if (!arguments.length) {
        return this._note;
    }
    this._note = str;
    return this;
};

Command.prototype.longDescription = function(str){
    if (!arguments.length) {
        return this._longDescription;
    }
    this._longDescription = str;
    return this;
};

var helpInformation = Command.prototype.helpInformation;
Command.prototype.helpInformation = function () {
    var description = '';
    if (this.longDescription()) {
        description += ['', '  ' + this.longDescription(), ''].join('\n');
    }

    description += helpInformation.call(this);

    if (this.note()) {
        description += ['', '  Note:', '', '    ' + this.note(), ''].join('\n');
    }

    return description;
};

function pad(str, width) {
    var len = Math.max(0, width - str.length);
    return str + (new Array(len + 1)).join(' ');
}

// because of hardcoded 22 :( -> 30
Command.prototype.commandHelp = function () {
    if (!this.commands.length) {
        return '';
    }
    return [
        '', '  Commands:', '', this.commands.map(function (cmd) {
            var args = cmd._args.map(function (arg) {
                return arg.required ? '<' + arg.name + '>' : '[' + arg.name + ']';
            }).join(' ');

            return pad(cmd._name + (cmd.options.length ? ' [options]' : '') + ' ' + args, 30) +
                (cmd.description() ? ' ' + cmd.description() : '');
        }).join('\n').replace(/^/gm, '    '), ''
    ].join('\n');
};

module.exports = new Command();
