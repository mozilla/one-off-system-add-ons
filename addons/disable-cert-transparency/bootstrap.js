/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 /* exported install, uninstall, startup, shutdown */
 /* eslint no-implicit-globals: "off" */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

const {Preferences} = Cu.import("resource://gre/modules/Preferences.jsm", this);

function install() {}

function uninstall() {}

function startup() {
  let defaults = new Preferences({defaultBranch: true});
  defaults.set("security.pki.certificate_transparency.mode", 0);
}

function shutdown(data, reason) {}
