/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

let {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Preferences.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/TelemetryController.jsm");
Cu.import("resource://gre/modules/Task.jsm");
const { setTimeout, clearTimeout } = Cu.import("resource://gre/modules/Timer.jsm", {});

const VERSION_MAX_PREF = "security.tls.version.max";

// Timeout after 2 minutes.
const TIMEOUT = "120000";

// These should be different hosts so that we don't bias any performance test
// toward 1.2.
const URLs = {
  "https://enabled.tls13.com/" : true,
  "https://disabled.tls13.com/" : true,
  "https://short.tls13.com/" : true,
  "https://control.tls12.com/" : false
};

const DEBUG = false;

let gStarted = false;
let gPrefs = new Preferences({ defaultBranch: true });
let gTimer;

function debug(msg) {
    if (DEBUG) {
        console.log(`TLSEXP: ${msg}`);
    }
}

// These variables are unreliable for some reason.
function read(obj, field) {
  try {
    return obj[field];
  } catch (e) {
    Cu.reportError(e);
  }
  return undefined;
}

function setTlsPref(prefs, value) {
  debug("Setting pref to " + value);
  prefs.set(VERSION_MAX_PREF, value);
}

// This might help us work out if there was a MitM
function recordSecInfo(channel, result) {
  let secInfo = channel.securityInfo;
  if (secInfo instanceof Ci.nsITransportSecurityInfo) {
    secInfo.QueryInterface(Ci.nsITransportSecurityInfo);
    const isSecure = Ci.nsIWebProgressListener.STATE_IS_SECURE;
    result.secure = !!(read(secInfo, 'securityState') & isSecure);
    result.prError = read(secInfo, 'errorCode');
  }
  if (secInfo instanceof Ci.nsISSLStatusProvider) {
    let sslStatus = secInfo.QueryInterface(Ci.nsISSLStatusProvider)
        .SSLStatus.QueryInterface(Ci.nsISSLStatus);
    let cert = read(sslStatus, 'serverCert');
    result.certfp = read(cert, 'sha256Fingerprint');  // A hex string
    result.version = read(sslStatus, 'protocolVersion');
  }
}

function makeRequest(prefs, index, url, body) {
  return new Promise(resolve => {
    if (!gStarted) {
      return;
    }

    debug("Setting pref");
    setTlsPref(prefs, URLs[url] ? 4 : 3);

    let t0 = Date.now();
    let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
        .createInstance(Ci.nsIXMLHttpRequest);
      req.open(
          body ? "POST" : "GET", url, true);
    req.setRequestHeader("Content-Type", "application/json");

    var result = {
      "index" : index,
      "url" : url,
      "start_time" : t0
    };
    req.timeout = 10000; // 10s is low intentionally
    req.addEventListener("error", e => {
      debug("Finished with error");
      let channel = e.target.channel;
      let nsireq = channel.QueryInterface(Ci.nsIRequest);
      result.error= nsireq ? nsireq.status : NS_ERROR_NOT_AVAILABLE;
      recordSecInfo(channel, result);
      result.elapsed = Date.now() - t0;
      debug("Re-setting pref");
      setTlsPref(prefs, 3);
      resolve(result);
    });
    req.addEventListener("loadend", e => {
      debug("Finished with load");
      if (!gStarted) {
        debug("Aborting.");
        return;
      }
      result.status = e.target.status;
      recordSecInfo(e.target.channel, result);
      result.elapsed = Date.now() - t0;
      debug("Resetting pref");
      setTlsPref(prefs, 3);
      resolve(result);
    });

    debug("Starting request for " + url + " TLS 1.3=" + URLs[url]);
    if (body) {
      req.send(JSON.stringify(body));
    } else {
      req.send();
    }
  });
}

/**
 * Report to telemetry with a custom ping.
 *
 * @param {String} status - one of "started", "report", "finished", "timedout"
 * @param {Array} result - optional, individual test results
 */
function report(status, result) {
  return TelemetryController.submitExternalPing(
    "tls-13-study-v4",
    {
      time: Date.now(),
      status: status,
      results: result
    }, {});
}

// Inefficient shuffle algorithm, but n <= 10
function shuffleArray(orig) {
  var inarr = [];
  for (let i in orig) {
    inarr.push(orig[i]);
  }
  var out = [];
    while (inarr.length > 0) {
        let x = Math.floor(Math.random() * inarr.length);
        out.push(inarr.splice(x, 1)[0])
  }
  return out;
}

function startup() {} // eslint-disable-line no-unused-vars

function shutdown() {} // eslint-disable-line no-unused-vars

// This is a simple experiment:
// - Install
// - Enable TLS 1.3.
// - Connect to a bunch of servers and record the results
//   (see README.md for details on report format)
function install() { // eslint-disable-line no-unused-vars
  // Don't do anything if the user has already messed with this
  // setting.
  let userprefs = new Preferences();
  if (userprefs.isSet(VERSION_MAX_PREF)) {
    console.log("User has changed TLS max version. Skipping");
    return;
  }

  // deadman timer to ensure we reset pref after 2 minutes
  gTimer = setTimeout(() => {
    try {
      debug("compat test timed out");
      gStarted = false;
      setTlsPref(gPrefs, 3);
      report("timedout");
    } catch (ex) {
      debug("timer failed:", ex);
    }
  }, TIMEOUT);

  report("started");
  gStarted = true;

  let shuffled = shuffleArray(Object.keys(URLs));
  let results = [];

  Task.spawn(function* () {
    for (var i in shuffled) {
      results.push(yield makeRequest(gPrefs, i, shuffled[i], null));
    }

    report("report", results);

  })
    .catch(e => Cu.reportError(e))
    .then(_ => {
      // Make sure we re-set to TLS 1.2.
      setTlsPref(gPrefs, 3);

      clearTimeout(gTimer);
      report("finished");
    });
}
function uninstall() {} // eslint-disable-line no-unused-vars
