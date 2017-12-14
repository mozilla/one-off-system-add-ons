/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported install, uninstall, startup, shutdown */
/* eslint no-implicit-globals: "off" */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Preferences.jsm");
Cu.import("resource://gre/modules/TelemetryController.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyGetter(this, "gStringBundle", () =>
  Services.strings.createBundle("chrome://outofdate-notifications/" +
                                "locale/" +
                                "outofdate-notifications.properties")
);

const PREF_UPDATE_URL = "app.update.url.manual";
const PREF_UPDATE_DEFAULT_URL = "https://www.mozilla.org/firefox";
const KNOWN_DISTROS = [
  "1und1",
  "acer",
  "aol",
  "bing",
  "gmx",
  "mail.com",
  "toshiba",
  "webde",
  "yandex",
  "yahoo"
];

let gPingTypes = [
  {
    payload: {event: "started"},
    sent: false
  },
  {
    payload: {event: "shown"},
    sent: false
  },
  {
    payload: {event: "clicked"},
    sent: false
  }];
let gIsPartnerRepack = false;

function sendPing(aPingIndex) {
  if (!gPingTypes[aPingIndex].sent) {
    TelemetryController.submitExternalPing(
      "outofdate-notifications-system-addon", gPingTypes[aPingIndex].payload,
      {addClientId: true});
    gPingTypes[aPingIndex].sent = true;
  }
}

function showDoorhanger(aWindow) {
  if (!aWindow || !aWindow.gBrowser) {
    return;
  }
  let message = gStringBundle.GetStringFromName("message");
  let buttons = [
    {
      label: gStringBundle.GetStringFromName("buttonlabel"),
      accessKey: gStringBundle.GetStringFromName("buttonaccesskey"),
      callback() {
        sendPing(2);

        let url = Preferences.get(PREF_UPDATE_URL, PREF_UPDATE_DEFAULT_URL);
        aWindow.openUILinkIn(url, "tab");
      }
    }
  ];
  let box =
    aWindow.document.getElementById("high-priority-global-notificationbox");
  if (!box) {
    return;
  }
  let notification = box.appendNotification(message, "outofdate-notifications",
    "", box.PRIORITY_WARNING_MEDIUM,
    buttons);
  let closeButton = aWindow.document.getAnonymousElementByAttribute(
    notification, "class", "messageCloseButton close-icon tabbable");
  closeButton.hidden = true;

  sendPing(1);
}

function loadIntoWindow(aWindow) {
  if (!aWindow) {
    return;
  }
  showDoorhanger(aWindow);
}

function unloadFromWindow(aWindow) {
  if (!aWindow) {
    return;
  }
  let box =
    aWindow.document.getElementById("high-priority-global-notificationbox");
  if (!box) {
    return;
  }
  let notification = box.getNotificationWithValue("outofdate-notifications");
  if (!notification) {
    return;
  }
  box.removeNotification(notification);
}

let windowListener = {
  onOpenWindow(aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindow);
    domWindow.addEventListener("load", function loadListener() {
      loadIntoWindow(domWindow);
    }, {once: true});
  },

  onCloseWindow(aWindow) {},
  onWindowTitleChange(aWindow, aTitle) {}
};

function startup() {
  // Don't run this addon for partner repacks.
  let defaultPrefs = new Preferences({defaultBranch: true});
  let distroId = defaultPrefs.get("distribution.id", "not-repack");

  for (let d of KNOWN_DISTROS) {
    if (d === distroId.substring(0, d.length)) {
      gIsPartnerRepack = true;
      return;
    }
  }

  // Load into any existing windows
  let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
  loadIntoWindow(browserWindow);

  // Load into any new windows
  Services.wm.addListener(windowListener);

  sendPing(0);
}

function shutdown(aData, aReason) {
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (aReason == APP_SHUTDOWN || gIsPartnerRepack) {
    return;
  }

  // Stop listening for new windows
  Services.wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
}

function install() {}

function uninstall() {}
