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

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

const APP_UPDATE_URL_PREF = "app.update.url";
const PREF_DEFAULTS_RESET_TOPIC = "prefservice:after-app-defaults";
const REPLACE_KEY = "%OS_VERSION%";
const REPLACE_KEY_REGEX = /%OS_VERSION%(?:\(\w+Bug1296630v1\))?(?:\(websense\)|\(nowebsense\))?\//;

// The system is not vulnerable to Bug 1296630.
const CPU_NO_BUG1296630 = 0;
// The system is vulnerable to Bug 1296630.
const CPU_YES_BUG1296630 = 1;
// An error occured when checking if the system is vulnerable to Bug 1296630.
const CPU_ERR_BUG1296630 = 2;
// It is unknown whether the system is vulnerable to Bug 1296630 (should never happen).
const CPU_UNKNOWN_BUG1296630 = 3;

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

/* eslint max-depth:off */
function startup() { // eslint-disable-line complexity, max-statements
  if (Services.appinfo.OS != "WINNT") {
    return;
  }

  const regCPUPath = "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0";
  let wrk;
  try {
    wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
    wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE, regCPUPath, wrk.ACCESS_READ);
  } catch (e) {
    Cu.reportError(`AUSHelper - unable to open registry. Exception: ${e}`);
    TelemetryLog.log("AUSHELPER_FATAL_ERROR", [e]);
  }

  // If any of the following values are successfully retrieved and they don't
  // match the condition for that value then it is safe to update. Hence why the
  // following checks are somewhat convoluted. The possible values for the
  // variable set by each check is as follows:
  //
  //          | Match | No Match | Error |
  // variable |  true |   false  |  null |

  let cpuVendorIDMatch = false;
  try {
    let cpuVendorID = wrk.readStringValue("VendorIdentifier");
    if (cpuVendorID.toLowerCase() == "genuineintel") {
      cpuVendorIDMatch = true;
    }
  } catch (e) {
    Cu.reportError(`AUSHelper - error getting CPU vendor indentifier. Exception: ${e}`);
    TelemetryLog.log("AUSHELPER_CPU_VENDOR_ID_ERROR", [e]);
    cpuVendorIDMatch = null;
  }

  let cpuIDMatch = false;
  try {
    let cpuID = wrk.readStringValue("Identifier");
    // eslint-disable-next-line mozilla/use-includes-instead-of-indexOf
    if (cpuID.toLowerCase().indexOf("family 6 model 61 stepping 4") != -1) {
      cpuIDMatch = true;
    }
  } catch (e) {
    Cu.reportError(`AUSHelper - error getting CPU indentifier. Exception: ${e}`);
    TelemetryLog.log("AUSHELPER_CPU_ID_ERROR", [e]);
    cpuIDMatch = null;
  }

  let microCodeVersions = [0xe, 0x11, 0x12, 0x13, 0x16, 0x18, 0x19];
  let cpuRevMatch = null;
  try {
    let keyNames = ["Update Revision", "Update Signature"];
    for (let i = 0; i < keyNames.length; ++i) {
      try {
        let regVal = wrk.readBinaryValue(keyNames[i]);
        if (regVal.length == 8) {
          let hexVal = [];
          // We are only inyterested in the upper 4 bytes and the little endian
          // value for it.
          for (let j = 4; j < 8; j++) {
            let c = regVal.charCodeAt(j).toString(16);
            if (c.length == 1) {
              c = `0${c}`;
            }
            hexVal.unshift(c);
          }
          cpuRevMatch = false;
          // eslint-disable-next-line mozilla/use-includes-instead-of-indexOf
          if (microCodeVersions.indexOf(parseInt(hexVal.join(""), 16)) != -1) {
            cpuRevMatch = true;
          }
          break;
        }
      } catch (e) {
        if (i == keyNames.length - 1) {
          // The registry key name's value was not successfully queried.
          TelemetryLog.log("AUSHELPER_CPU_REV_ERROR", [e]);
          cpuRevMatch = null;
        }
      }
    }
    wrk.close();
  } catch (ex) {
    Cu.reportError(`AUSHelper - error getting CPU revision. Exception: ${ex}`);
    TelemetryLog.log("AUSHELPER_CPU_REV_ERROR", [ex]);
    cpuRevMatch = null;
  }

  let cpuResult = CPU_UNKNOWN_BUG1296630;
  let cpuValue = "(unkBug1296630v1)";
  // The following uses strict equality checks since the values can be true,
  // false, or null.
  if (cpuVendorIDMatch === false || cpuIDMatch === false || cpuRevMatch === false) {
    // Since one of the values is false then the system won't be affected by
    // bug 1296630 according to the conditions set out in bug 1311515.
    cpuValue = "(noBug1296630v1)";
    cpuResult = CPU_NO_BUG1296630;
  } else if (cpuVendorIDMatch === null || cpuIDMatch === null || cpuRevMatch === null) {
    // Since one of the values is null we can't say for sure if the system will
    // be affected by bug 1296630.
    cpuValue = "(errBug1296630v1)";
    cpuResult = CPU_ERR_BUG1296630;
  } else if (cpuVendorIDMatch === true && cpuIDMatch === true && cpuRevMatch === true) {
    // Since all of the values are true we can say that the system will be
    // affected by bug 1296630.
    cpuValue = "(yesBug1296630v1)";
    cpuResult = CPU_YES_BUG1296630;
  }

  TelemetryLog.log("AUSHELPER_RESULT", [cpuResult]);

  const regWebsensePath = "Websense\\Agent";
  let websenseVersion = "";
  try {
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
        Cu.reportError(`AUSHelper - unable to read registry. Exception: ${e}`);
        TelemetryLog.log("WEBSENSE_REG_READ_ERROR", [e]);
      }
    }
  } catch (ex) {
    Cu.reportError(`AUSHelper - unable to open registry. Exception: ${ex}`);
    TelemetryLog.log("WEBSENSE_REG_OPEN_ERROR", [ex]);
  }

  let websenseValue = `(${websenseVersion ? `websense-${websenseVersion}` : "nowebsense"})`;

  let branch = Services.prefs.getDefaultBranch("");
  let curValue = branch.getCharPref(APP_UPDATE_URL_PREF);

  if (REPLACE_KEY_REGEX.test(curValue)) {
    let newValue = curValue.replace(REPLACE_KEY_REGEX, `${REPLACE_KEY + cpuValue + websenseValue}/`);
    branch.setCharPref(APP_UPDATE_URL_PREF, newValue);
    TelemetryLog.log("WEBSENSE_MODIFIED", [newValue]);
  } else {
    TelemetryLog.log("WEBSENSE_ALREADY_MODIFIED", [curValue]);
  }

  Services.obs.addObserver(observer, PREF_DEFAULTS_RESET_TOPIC);
  Services.prefs.addObserver(APP_UPDATE_URL_PREF, observer);
}

function shutdown() {
  Services.obs.removeObserver(observer, PREF_DEFAULTS_RESET_TOPIC);
  Services.prefs.removeObserver(APP_UPDATE_URL_PREF, observer);
}

function install() {}
function uninstall() {}
