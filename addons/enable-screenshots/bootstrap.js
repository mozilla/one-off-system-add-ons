/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported install, uninstall, startup, shutdown */
/* eslint no-implicit-globals: "off" */

// eslint-disable-next-line mozilla/use-cc-etc
Components.utils.import("resource://gre/modules/Services.jsm");

function install() {}

function uninstall() {}

function startup() {
  Services.prefs.setBoolPref("extensions.screenshots.system-disabled", false);
}

function shutdown(data, reason) {}
