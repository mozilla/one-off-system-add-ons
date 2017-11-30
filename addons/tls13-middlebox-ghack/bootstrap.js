"use strict";

let {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Preferences", "resource://gre/modules/Preferences.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryController", "resource://gre/modules/TelemetryController.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "certDB", "@mozilla.org/security/x509certdb;1", "nsIX509CertDB");
XPCOMUtils.defineLazyServiceGetter(this, "uuidGenerator", "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator");

const VERSION_MAX_PREF = "security.tls.version.max";
const VERSION_FALLBACK_LIMIT_PREF = "security.tls.version.fallback-limit";

const CERT_USAGE_SSL_CLIENT      = 0x0001;
const CERT_USAGE_SSL_SERVER      = 0x0002;
const CERT_USAGE_SSL_CA          = 0x0008;
const CERT_USAGE_EMAIL_SIGNER    = 0x0010;
const CERT_USAGE_EMAIL_RECIPIENT = 0x0020;
const CERT_USAGE_OBJECT_SIGNER   = 0x0040;

const REPEAT_COUNT = 5;

const XHR_TIMEOUT = 10000;

const TELEMETRY_PING_NAME = "tls13-middlebox-ghack";

const GMAIL_URL = "https://mail.google.com/robots.txt";

let configurations = [
  {label: "google-tls13-draft-18", versionMax: 4, versionFallbackLimit: 4, website: GMAIL_URL},
  {label: "google-tls13-exp", versionMax: 4, versionFallbackLimit: 4, website: GMAIL_URL, tlsFlags: 0x40},
  {label: "google-tls12", versionMax: 3, versionFallbackLimit: 3, website: GMAIL_URL}
];

let probe_id = null;

function debug(msg) {
  console.log(msg); // eslint-disable-line no-console
}

// some fields are not available sometimes, so we have to catch the errors and return undefined.
function getFieldValue(obj, name) {
  try {
    return obj[name];
  } catch (ex) {
    return undefined;
  }
}

// enumerate nsIX509CertList data structure and put elements in the array
function nsIX509CertListToArray(list) {
  let array = [];

  let iter = list.getEnumerator();

  while (iter.hasMoreElements()) {
    array.push(iter.getNext().QueryInterface(Ci.nsIX509Cert));
  }

  return array;
}

// verifies the cert using either SSL_SERVER or SSL_CA usages and extracts the chain
// returns null in case an error occurs
function getCertChain(cert, usage) {
  return new Promise((resolve, reject) => {
    certDB.asyncVerifyCertAtTime(cert, usage, 0, null, Date.now() / 1000, (aPRErrorCode, aVerifiedChain, aHasEVPolicy) => {
      if (aPRErrorCode === 0) {
        resolve(nsIX509CertListToArray(aVerifiedChain));
      } else {
        resolve(null);
      }
    });
  });
}

// returns true if there is at least one non-builtin root certificate is installed
async function isNonBuiltInRootCertInstalled() {
  let certs = nsIX509CertListToArray(certDB.getCerts());

  for (let cert of certs) {
    let chain = await getCertChain(cert, CERT_USAGE_SSL_CA);

    if (chain !== null && chain.length === 1 && !chain[0].isBuiltInRoot) {
      return true;
    }
  }

  return false;
}

async function getInfo(xhr) {
  let result = {};

  try {
    let channel = xhr.channel;

    // this is the most important value based on which we can find out the problem
    channel.QueryInterface(Ci.nsIRequest);
    result.status = getFieldValue(channel, "status");

    let securityInfo = getFieldValue(channel, "securityInfo");

    if (securityInfo instanceof Ci.nsITransportSecurityInfo) {
      securityInfo.QueryInterface(Ci.nsITransportSecurityInfo);

      // extract security state and error code by which we can identify the reasons the connection failed
      result.securityState = getFieldValue(securityInfo, "securityState");
      result.errorCode = getFieldValue(securityInfo, "errorCode");
    }

    if (securityInfo instanceof Ci.nsISSLStatusProvider) {
      securityInfo.QueryInterface(Ci.nsISSLStatusProvider);
      let sslStatus = getFieldValue(securityInfo, "SSLStatus");

      if (sslStatus) {
        sslStatus.QueryInterface(Ci.nsISSLStatus);

        // in case cert verification failed, we need to extract the cert chain from failedCertChain attribute
        // otherwise, we extract cert chain using certDB.asyncVerifyCertAtTime API
        let chain = null;

        if (getFieldValue(securityInfo, "failedCertChain")) {
          chain = nsIX509CertListToArray(securityInfo.failedCertChain);
        } else {
          chain = await getCertChain(getFieldValue(sslStatus, "serverCert"), CERT_USAGE_SSL_SERVER);
        }

        // extracting sha256 fingerprint for the leaf cert in the chain
        result.serverSha256Fingerprint = getFieldValue(chain[0], "sha256Fingerprint");

        // check the root cert to see if it is builtin certificate
        result.isBuiltInRoot = (chain !== null && chain.length > 0) ? getFieldValue(chain[chain.length - 1], "isBuiltInRoot") : null;

        // record the tls version Firefox ended up negotiating
        result.protocolVersion = getFieldValue(sslStatus, "protocolVersion");
      }
    }
  } catch (ex) {
    result.exception = ex.message;
  }

  return result;
}

function makeRequest(config) {
  return new Promise((resolve, reject) => {
    // put together the configuration and the info collected from the connection
    async function reportResult(event, xhr) {
      resolve(Object.assign({"event": event, "responseCode": xhr.status}, await getInfo(xhr)));
      return true;
    }

    try {
      let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);

      xhr.open("HEAD", config.website, true);

      xhr.timeout = XHR_TIMEOUT;

      xhr.channel.loadFlags = 0;
      xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
      xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
      xhr.channel.loadFlags |= Ci.nsIRequest.INHIBIT_CACHING;
      xhr.channel.loadFlags |= Ci.nsIRequest.INHIBIT_PIPELINE;
      xhr.channel.loadFlags |= Ci.nsIRequest.INHIBIT_PERSISTENT_CACHING;
      xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_FRESH_CONNECTION;
      xhr.channel.loadFlags |= Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
      xhr.channel.QueryInterface(Ci.nsIHttpChannelInternal);
      xhr.channel.tlsFlags = 0;
      xhr.channel.tlsFlags |= (config.versionMax << 0);
      xhr.channel.tlsFlags |= (config.versionFallbackLimit << 3);
      xhr.channel.tlsFlags |= config.tlsFlags;
      xhr.addEventListener("load", e => {
        reportResult("load", e.target);
      });

      xhr.addEventListener("loadend", e => {
        reportResult("loadend", e.target);
      });

      xhr.addEventListener("error", e => {
        reportResult("error", e.target);
      });

      xhr.addEventListener("abort", e => {
        reportResult("abort", e.target);
      });

      xhr.addEventListener("timeout", e => {
        reportResult("timeout", e.target);
      });

      xhr.send();
    } catch (ex) {
      resolve(Object.assign({result: {"event": "exception", "description": ex.toSource()}}, config));
    }
  });
}

// shuffle the array randomly
function shuffleArray(original_array) {
  let copy_array = original_array.slice();

  let output_array = [];

  while (copy_array.length > 0) {
    let x = Math.floor(Math.random() * copy_array.length);
    output_array.push(copy_array.splice(x, 1)[0]);
  }

  return output_array;
}

// make the request for each configuration
async function runConfigurations() {
  let results = [];

  let configs = shuffleArray(configurations);

  for (let c = 0; c < configs.length; c++) {
    results.push(Object.assign(configs[c], {"results": []}));
  }

  for (let i = 0; i < REPEAT_COUNT; i++) {
    for (let c = 0; c < configs.length; c++) {
      // we wait until the result is ready for the current configuration
      // and then move on to the next configuration
      results[c].results.push(await makeRequest(configs[c]));
    }
  }

  return results;
}

function sendToTelemetry(status, data) {
  TelemetryController.submitExternalPing(TELEMETRY_PING_NAME, Object.assign({
    "id": probe_id,
    "status": status
  }, data));
}

function startup() {
}

function shutdown() {
}

function install() {
  // generate random UUID for identifying probes uniquely
  probe_id = uuidGenerator.generateUUID().toString();

  // send start of the test probe
  try {
    sendToTelemetry("started", {});

    runConfigurations().then(tests_result => {
      // restore the default values after the experiment is over
      let prefs = new Preferences();

      let final_output = {
        "defaultVersionMax": prefs.get(VERSION_MAX_PREF),
        "defaultVersionFallbackLimit": prefs.get(VERSION_FALLBACK_LIMIT_PREF),
        "tests": tests_result
      };

      // report the test results to telemetry
      isNonBuiltInRootCertInstalled().then(non_builtin_result => {
        final_output.isNonBuiltInRootCertInstalled = non_builtin_result;
        sendToTelemetry("finished", final_output);

        return true;
      }).catch(err => {
        final_output.exception = err.toSource();
        sendToTelemetry("finished", final_output);
      });

      return true;
    }).catch(err => {
      sendToTelemetry("canceled", {"exception": err.toSource()});
    });
  } catch (ex) {
    sendToTelemetry("canceled", {"exception": ex.toSource()});
  }
}

function uninstall() {
}
