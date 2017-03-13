/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NOTE: the following file was mostly copied from code in beta 52 right now.
// (http://searchfox.org/mozilla-central/rev/60ae6514e4c559c0c234f0e7aefccb101b8beb2e/browser/extensions/aushelper/bootstrap.js#1)
// The only real changes made were the removal of the telemetry logic (as we
// need the changes in Histograms.json and Scalars.yaml), and in the REPLACE_KEY
// matching. Instead of REPLACE_KEY + "/", we match on a regex which accounts for
// the possibility that the Bug1296630 replacement has already run.

const PREF_DEFAULTS_RESET_TOPIC = "prefservice:after-app-defaults";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

const APP_UPDATE_URL_PREF = "app.update.url";
const REPLACE_KEY = "%OS_VERSION%";
const REPLACE_KEY_REGEX = /%OS_VERSION%(?:\(websense\)|\(nowebsense\))?\//;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/TelemetryLog.jsm");

const observer = {
  observe(subject, topic, data) {
    switch (topic) {
      case "prefservice:after-app-defaults":
        TelemetryLog.log("WEBSENSE_DEFAULT_PREFS_RESET");
        break;
      case "nsPref:changed": {
        let branch = Services.prefs.getDefaultBranch("");
        let prefValue = branch.getCharPref(APP_UPDATE_URL_PREF);
        TelemetryLog.log("WEBSENSE_PREF_CHANGED", [prefValue]);
        break;
      }
    }
  }
};

function startup() {
  if (Services.appinfo.OS != "WINNT") {
    return;
  }

  let wrk;
  const regWebsensePath = "Websense\\Agent";
  let websenseVersion = "";
  try {
    wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
    let regModes = [wrk.ACCESS_READ, wrk.ACCESS_READ | wrk.WOW64_64];
    for (let i = 0; i < regModes.length; ++i) {
      wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE, "SOFTWARE", regModes[i]);
      try {
        if (wrk.hasChild(regWebsensePath)) {
          let childKey = wrk.openChild(regWebsensePath, wrk.ACCESS_READ);
          websenseVersion = childKey.readStringValue("InstallVersion");
        }
        wrk.close();
      } catch (e) {
        Cu.reportError(`WebsenseHelper - unable to read registry. Exception: ${e}`);
        TelemetryLog.log("WEBSENSE_REG_READ_ERROR", [e]);
      }
    }
  } catch (ex) {
    Cu.reportError(`WebsenseHelper - unable to open registry. Exception: ${ex}`);
    TelemetryLog.log("WEBSENSE_REG_OPEN_ERROR", [ex]);
  }

  let websenseValue = `(${websenseVersion ? `websense-${websenseVersion}` : "nowebsense"})`;

  let branch = Services.prefs.getDefaultBranch("");
  let curValue = branch.getCharPref(APP_UPDATE_URL_PREF);

  if (REPLACE_KEY_REGEX.test(curValue)) {
    let newValue = curValue.replace(REPLACE_KEY_REGEX, `${REPLACE_KEY + websenseValue}/`);
    branch.setCharPref(APP_UPDATE_URL_PREF, newValue);
    TelemetryLog.log("WEBSENSE_MODIFIED", [newValue]);
  } else {
    TelemetryLog.log("WEBSENSE_ALREADY_MODIFIED", [curValue]);
  }

  Services.obs.addObserver(observer, PREF_DEFAULTS_RESET_TOPIC, false);
  Services.prefs.addObserver(APP_UPDATE_URL_PREF, observer, false);
}

function shutdown() {
  Services.obs.removeObserver(observer, PREF_DEFAULTS_RESET_TOPIC);
  Services.prefs.removeObserver(APP_UPDATE_URL_PREF, observer);
}

function install() {}
function uninstall() {}
