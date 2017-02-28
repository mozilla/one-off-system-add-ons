let {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Preferences.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/TelemetryController.jsm");
Cu.import("resource://gre/modules/Task.jsm");

var gStarted = false;
const kVERSION_MAX_PREF = "security.tls.version.max";

// These should be different hosts so that we don't bias any performance test
// toward 1.2.
const kURLs = {
  "https://enabled.tls13.com/" : true,
  "https://disabled.tls13.com/" : true,
  "https://short.tls13.com/" : true,
  "https://control.tls12.com/" : false
};

// Ugh, keys() doesn't work.
let kURLList = Object.keys(kURLs);

// let kDebug = true;
let kDebug = false;

function debug(msg) {
    if (kDebug) {
        console.log(msg);
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
  prefs.set(kVERSION_MAX_PREF, value);
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
    debug("Setting pref");
    setTlsPref(prefs, kURLs[url] ? 4 : 3);
      
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
      debug("TLSEXP: Finished with error");
      let channel = e.target.channel;
      let nsireq = channel.QueryInterface(Ci.nsIRequest);
      result.error= nsireq ? nsireq.status : NS_ERROR_NOT_AVAILABLE;
      recordSecInfo(channel, result);
      result.elapsed = Date.now() - t0;
      debug("Re-setting pref");
      setTlsPref(prefs, 3);
      resolve(result);
    });
    req.addEventListener("load", e => {
      debug("TLSEXP: Finished with load");
      result.status = e.target.status;
      recordSecInfo(e.target.channel, result);
      result.elapsed = Date.now() - t0;
      debug("Resetting pref");
      setTlsPref(prefs, 3);      
      resolve(result);
    });

    debug("TLSEXP: Starting request for " + url + " TLS 1.3=" + kURLs[url]);
    if (body) {
      req.send(JSON.stringify(body));
    } else {
      req.send();
    }
  });
}

function report(result) {
  return TelemetryController.submitExternalPing(
    "tls-13-study-v3",
    {
      time: Date.now(),
      results: result
    }, {});
}

// Inefficient shuffle algorithm, but n <= 10
function shuffleArray(orig) {
  var inarr = [];
  for (i in orig) {
    inarr.push(orig[i]);
  }
  var out = [];
    while(inarr.length > 0) {
        x = Math.floor(Math.random() * inarr.length);
        out.push(inarr.splice(x,1)[0])
  }
  return out;
}

function startup() {}

function shutdown() {}

// This is a simple experiment:
// - Install
// - Enable TLS 1.3.
// - Connect to a bunch of servers and record the results
//   (see README.md for details on report format)
function install() {
  // Don't do anything if the user has already messed with this
  // setting.
  let userprefs = new Preferences();
  if (userprefs.isSet(kVERSION_MAX_PREF)) {
    console.log("User has changed TLS max version. Skipping");
    return;
  }
  

  gStarted = true;
  let prefs = new Preferences({ defaultBranch: true });
  let shuffled = shuffleArray(kURLList);
  let results = [];
  
  Task.spawn(function* () {
    for (var i in shuffled) {
      results.push(yield makeRequest(prefs, i, shuffled[i], null));
    }

    report(results);
  })
    .catch(e => Cu.reportError(e))
    .then(_ => {
      // Make sure we re-set to TLS 1.2.
      setTlsPref(prefs, 3);
    }).
    then(_ => resolve());
}
function uninstall() {}



