/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

let {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/ClientID.jsm");

Cu.importGlobalProperties(["crypto", "TextEncoder"]);

// initially roll out to 10%, we want to control this on the client rather than
// depending on server-side throttling, as throttling cannot account for any
// other concurrent gradual roll-outs.
const ENABLE_PROB = 0.1;
const DEBUG = false;
const VERSION_MAX_PREF = "security.tls.version.max";

function debug(msg) {
  if (DEBUG) {
    console.log(`TLS 1.3 Test: ${msg}`); // eslint-disable-line no-console
  }
}

async function generateVariate(seed, label) {
  const hasher = crypto.subtle;
  const hash = await hasher.digest("SHA-256", new TextEncoder("utf-8").encode(seed + label));
  let view = new DataView(hash);
  return view.getUint32(0) / 0xffffffff;
}

async function startup(data, reason) {
  // Don't do anything if the user has already messed with this
  // setting.
  if (Services.prefs.prefHasUserValue(VERSION_MAX_PREF)) {
    debug("User has changed TLS max version. Skipping");
    return;
  }

  debug("Installing");

  let variate = await generateVariate(ClientID.getClientID(), data.id);
  debug(variate);
  let prefs = Services.prefs.getDefaultBranch("")

  if (variate < ENABLE_PROB) {
    debug("Setting TLS 1.3 on");
    prefs.setIntPref(VERSION_MAX_PREF, 4);
  }
}

function shutdown() {}
function install() {}
function uninstall() {}
