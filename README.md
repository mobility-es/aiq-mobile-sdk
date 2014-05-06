# aiq

  AppearIQ Mobile SDK

  [![Build Status](https://travis-ci.org/appear/aiq-mobile-sdk.png?branch=master)](https://travis-ci.org/appear/aiq-mobile-sdk)

## Installation

    $ npm install -g aiq

## Usage

    $ aiq

    Usage: aiq [options] [command]

    Commands:

      login                  Login to the IA
      logout                 Destroy AccessToken
      list                   Display list of existent HTML5 Applications
      pub [options] [path]   Publish HTML5 App to the platform
      update [options] [path] Update existent HTML5 App
      unpub [options] [path] Remove specific HTML5 App from the platform
      server [options] [path] Run local WebServer

    Options:

      -h, --help                   output usage information
      -V, --version                output the version number
      -o, --orgName <orgName>      organization
      -u, --username <username>    Username
      -p, --password <password>    Password
      -s, --serverUrl [serverUrl]  IA Server URL [serverUrl]

## Testing

In order to test specific branch:

  * Clone the repository & checkout to the specific branch
  * Run `npm i` in the root of the repository
  * Use `./bin/aiq`

## License

(The MIT License)

Copyright (c) 2013 Appear Networks

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
