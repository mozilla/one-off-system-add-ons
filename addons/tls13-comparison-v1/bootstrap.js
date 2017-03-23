/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

let {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Preferences.jsm");
Cu.import("resource://gre/modules/ClientID.jsm");

Cu.importGlobalProperties(["crypto", "TextEncoder"]);
const DEBUG = false;
const ENABLE_PROB = .5;
let gStarted = false;
const VERSION_MAX_PREF = "security.tls.version.max";

function debug(msg) {
    if (DEBUG) {
        console.log(`TLS 1.3 Test: ${msg}`);
    }
}

async function getRandomnessSeed() {
  return ClientID.getClientID();
}

function toHex(arr) {
  let hexCodes = [];
  for (let i = 0; i < arr.length; ++i) {
    hexCodes.push(arr[i].toString(16).padStart(2, "0"));
  }

  return hexCodes.join("");
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
  let userprefs = new Preferences();
  if (userprefs.isSet(VERSION_MAX_PREF)) {
    console.log("User has changed TLS max version. Skipping");
    return;
  }
  
  // Seems startup() function is launched twice after install, we're
  // unsure why so far. We only want it to run once.
  if (gStarted) {
    debug("Attempt to call startup twice. reason="+reason);
    return;
  }

  debug("Installing");

  let variate = await generateVariate(await getRandomnessSeed(), data.id);
  debug(variate);
  let prefs = new Preferences({ defaultBranch: true });

  // The reason we set both arms here is so that this add-on will
  // work properly on both Beta (where TLS 1.3 is on) and
  // Release (where TLS 1.3 is off).
  if (variate < ENABLE_PROB) {
    console.log("Setting TLS 1.3 on");
    prefs.set(VERSION_MAX_PREF, 4);
  } else {
    console.log("Setting TLS 1.3 off");
    prefs.set(VERSION_MAX_PREF, 3);
  }
}

function shutdown() {
  gStarted = false;
}

function install() {}
function uninstall() {}

