/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* We need to disable these because this system add-on
 * goes back to Firefox 43 */

/* eslint-disable mozilla/no-useless-parameters */
/* eslint-disable mozilla/no-define-cc-etc */
/* eslint-disable mozilla/use-default-preference-values */
/* eslint-disable mozilla/use-chromeutils-import */

let {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");

function overrideSearchEngine() {
  let engine = Services.search.getEngineByName("Google");
  if (!engine) {
    return;
  }
  let countryCode;
  let searchCode;
  let shortName;
  try {
    countryCode = Services.prefs.getCharPref("browser.search.countryCode");
  } catch (e) {}
  if (countryCode == "US") {
    searchCode = "firefox-b-1";
    shortName = "google-2018-sysaddon";
  } else {
    // Err on the side of using global codes
    searchCode = "firefox-b";
    shortName = "google-sysaddon";
  }

  let testSubmission = engine.getSubmission("test", null, "searchbar");
  if (testSubmission.uri.spec.endsWith(searchCode)) {
    // We already have the correct search code. Don't do anything.
    return;
  }

  engine = engine.wrappedJSObject;
  let url = engine._urls.filter(u => u.type == "text/html")[0];
  let clientParams = url.params.filter(p => p.name == "client");
  let paramsWithPurpose = clientParams.filter(p => p.purpose);
  if (clientParams.length &&
      !paramsWithPurpose.length) {
    return;
  }
  if (paramsWithPurpose.length) {
    url.params = url.params.filter(p => !p.purpose);
  }
  url.params.push({name: "client", value: searchCode, purpose: "searchbar"});
  url.params.push({name: "client", value: `${searchCode}-ab`, purpose: "keyword"});
  // In older versions of Firefox, if a purpose was passed and a search plugin
  // didn't support it, it was ignored. So we need to add every purpose.
  url.params.push({name: "client", value: searchCode, purpose: "contextmenu"});
  url.params.push({name: "client", value: searchCode, purpose: "homepage"});
  url.params.push({name: "client", value: searchCode, purpose: "newtab"});
  url.params.push({name: "client", value: searchCode, purpose: "system"});
  engine._shortName = shortName;
}

function startup(data, reason) {
  if (Services.search.isInitialized) {
    overrideSearchEngine();
  } else {
    Services.obs.addObserver(function searchObserver(subject, topic, data) {
      if (data == "init-complete") {
        Services.obs.removeObserver(searchObserver, "browser-search-service");
        overrideSearchEngine();
      }
    }, "browser-search-service", false);
  }
}

function shutdown() {}
function install() {}
function uninstall() {}
