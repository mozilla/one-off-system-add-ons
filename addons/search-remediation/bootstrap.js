/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* We need to disable these because this system add-on
 * goes back to Firefox 43 */

/* eslint-disable mozilla/no-useless-parameters */
/* eslint-disable mozilla/no-define-cc-etc */
/* eslint-disable mozilla/use-chromeutils-import */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

let observer = {
  _submissionURLIgnoreList: [
    "hspart=lvs",
    "form=CONBDF",
    "clid=2308146",
    "fr=mcafee",
    "PC=MC0"
  ],

  _loadPathIgnoreList: [
    "[https]opensearch.webofsearch.com/bing-search.xml",
    "[https]opensearch.startpageweb.com/bing-search.xml",
    "[https]opensearch.startwebsearch.com/bing-search.xml",
    "[https]opensearch.webstartsearch.com/bing-search.xml"
  ],

  observe: function observe(subject, topic, data) {
    switch (topic) {
      case "browser-search-service": {
        if (data != "init-complete") {
          return;
        }
        let engines = Services.search.getEngines();
        engines.forEach(engine => {
          let url = engine.getSubmission("dummy", null, "keyword").uri.spec.toLowerCase();
          if (this._submissionURLIgnoreList.some(code => url.includes(code.toLowerCase()))) {
            Services.search.removeEngine(engine);
          } else if (this._loadPathIgnoreList.includes(engine.wrappedJSObject._loadPath)) {
            Services.search.removeEngine(engine);
          }
        });
        break;
      }
    }
  }
};

function install(aData, aReason) {}

function uninstall(aData, aReason) {}

function startup(aData, aReason) {
  Services.obs.addObserver(observer, "browser-search-service", false);
}
function shutdown(aData, aReason) {
  Services.obs.removeObserver(observer, "browser-search-service");
}
