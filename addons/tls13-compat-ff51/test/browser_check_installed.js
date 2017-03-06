/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global AddonManager */

"use strict";

add_task(function* installed() {
  let addon = yield new Promise(
    (resolve) => AddonManager.getAddonByID("tls13-compat-ff51@mozilla.org", resolve)
  );
  isnot(addon, null, "addon should exist");
  is(addon.name, "TLS 1.3 Compatibility Testing");
  ok(addon.isCompatible, "addon is compatible with Firefox");
  ok(!addon.appDisabled, "addon is not app disabled");
  ok(addon.isActive, "addon is active");
  is(addon.type, "extension", "addon is type extension");
});
