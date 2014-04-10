/**
 * aiq
 * https://github.com/appear/aiq-mobile-sdk
 *
 * Copyright (c) 2014 Appear Networks
 * Licensed under the MIT license.
 */
'use strict';

module.exports = function (grunt) {

    grunt.initConfig({
        jshint: {
            all: [
                'Gruntfile.js',
                'bin/aiq',
                '<%= nodeunit.tests %>'
            ],
            options: {
                jshintrc: '.jshintrc',
            }
        },

        nodeunit: {
            tests: ['test/*_test.js']
        }
    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');

    grunt.registerTask('test', ['nodeunit']);
    grunt.registerTask('default', ['jshint', 'test']);
};
