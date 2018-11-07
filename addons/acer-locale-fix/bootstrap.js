/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* eslint-disable-next-line */
let {classes: Cc, interfaces: Ci, utils: Cu} = Components;

/* eslint-disable mozilla/use-chromeutils-import */
Cu.import("resource://gre/modules/Services.jsm");

const OLD_LOCALE_PREF = "general.useragent.locale";
const NEW_LOCALE_PREF = "intl.locale.requested";

let observer = {
  observe(subject, topic, data) {
    try {
      subject.getCharPref(OLD_LOCALE_PREF);
      subject.setCharPref(NEW_LOCALE_PREF, subject.getCharPref(OLD_LOCALE_PREF));
    } catch (e) {
      // Ignore errors
    }
    subject.removeObserver(OLD_LOCALE_PREF, observer);
  }
};

function startup(data, reason) {
  Services.prefs.getDefaultBranch(null).addObserver(OLD_LOCALE_PREF, observer);
}

function shutdown() {}
function install() {}
function uninstall() {}
