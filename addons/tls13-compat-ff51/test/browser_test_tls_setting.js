/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Preferences } = Cu.import("resource://gre/modules/Preferences.jsm", {});
const { TelemetryArchive } = Cu.import("resource://gre/modules/TelemetryArchive.jsm", {});


"use strict";

// The Firefox TLS setting. 3 is TLS 1.2, 4 is TLS 1.3
const VERSION_MAX_PREF = "security.tls.version.max";

add_task(function* installed() {
  let userprefs = new Preferences();
  ok(!userprefs.isSet(VERSION_MAX_PREF), "setting should not have been user modified");

  let addon = yield new Promise(
    (resolve) => AddonManager.getAddonByID("tls13-compat-ff51@mozilla.org", resolve)
  );
  ok(addon.isActive, "addon is active");
  is(userprefs.get(VERSION_MAX_PREF), 3, "setting should be reset after add-on is active");

  let list = yield TelemetryArchive.promiseArchivedPingList();
  is(list.length, 3, "correct number of telemetry entries")

  let expectedType = "tls-13-study-v4";

  let startPing = yield TelemetryArchive.promiseArchivedPingById(list[0].id);
  is(startPing.type, expectedType, "startup telemetry ping type is correct")
  is(startPing.payload.status, "started", "first telemetry ping is startup");

  let dataPing = yield TelemetryArchive.promiseArchivedPingById(list[1].id);
  is(dataPing.type, expectedType, "data telemetry ping type is correct");
  is(dataPing.payload.results.length, 2, "data telemetry ping correct number of results");

  // the add-on shuffles the order it loads URLs.
  for (let result of dataPing.payload.results) {
    let expectedUrl = (result.url == "https://test1.example.com" ||
                       result.url == "https://test2.example.com");
    ok(expectedUrl, "data ping URL is expected");
    is(result.status, "200", "data ping result status is 200");
    ok(result.secure, "data ping result secure is true");
  }

  let finishedPing = yield TelemetryArchive.promiseArchivedPingById(list[2].id);
  is(finishedPing.type, expectedType, "finished telemetry ping type is correct")
  is(finishedPing.payload.status, "finished", "first telemetry ping is startup");
});
