#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This script installs Node v8.

wget https://nodejs.org/dist/v8.4.0/node-v8.4.0-linux-x64.tar.gz
echo 'd12bf2389a6b57341528a33de62561edd7ef25c23fbf258d48758fbe3d1d8578  node-v8.4.0-linux-x64.tar.gz' | sha256sum -c
tar -C /usr/local -xz --strip-components 1 < node-v8.4.0-linux-x64.tar.gz
node -v  # verify
npm -v
