# aiq

  AppearIQ Mobile SDK

  [![Build Status](https://travis-ci.org/appear/aiq-mobile-sdk.png?branch=master)](https://travis-ci.org/appear/aiq-mobile-sdk)


## Pre-Requirements

  * [NodeJS](http://nodejs.org/download/)
      * **Mac/Win** - use package from the URL above
      * **Linux (debian-based)** - run:

            sudo add-apt-repository ppa:chris-lea/node.js
            sudo apt-get update
            sudo apt-get install nodejs

## Installation

    $ npm install -g aiq

## Usage

    $ aiq

    Usage: aiq [options] [command]

    Commands:

      user                           display information about current session
      login [options]                authenticate against the platform and stores the access token
      logout                         destroy the stored access token
      list                           display list of apps on platform
      publish [options] [path]       publish a new app to platform
      update [options] [path]        update an existing app
      unpublish [options]            remove specific app from platform
      run [options] [path]           run the app on a local WebServer

    Options:

      -h, --help     output usage information
      -v, --version  output the AIQ mobile sdk version

## Testing

In order to test specific branch:

  * Clone the repository & checkout to the specific branch
  * Run `npm i` in the root of the repository
  * Use `./bin/aiq`

## License

(The MIT License)

Copyright (c) 2014 Appear Networks

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
