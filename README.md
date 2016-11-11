# one-off-system-add-ons
One off system add-ons ship fixes and updates to users of releases already shipped, without needing a dot release.

For a complete overview of all parts of the system add-on process (QA, relman, etc), please visit the Wiki at: https://wiki.mozilla.org/Firefox/Go_Faster/System_Add-ons/Process.

Some [original documentation](https://pad.mocotoolsprod.net/gofaster_oneoffaddons).

---

## What is this repository?

This repository should be used as a resource for Firefox developers to quickly develop and test one off system add-ons. If you would like to deploy a fix or update as a system add-on, we ask that you use this repository to host your code and get it reviewed.

## What is the criteria for a "One Off System Add-on"?

These are things that are primarily fixes and updates we would like to deploy to users of releases that are already shipped. Some good examples would be pref flips. These are not new features (Hello, SHIELD, etc).

## Where can I find more system add-ons?

Look here: https://wiki.mozilla.org/Firefox/Go_Faster/System_Add-ons/Process#Where_can_I_find_existing_examples_of_system_add-ons.3F

## Review Requirements

Generally, changes to this repository should have a review from a
[Firefox peer](https://wiki.mozilla.org/Modules/Firefox). If the add-on relates
to a platform change, then it should have review from an appropriate peer of that
area.

## Tests

Currently only eslint is enabled on the repository, however we hope to have
a unit/functional test harness soon.

To get the required dependencies:

```shell
npm install
```

The tests can be run with:

```shell
npm test
```

## Todo

* history of the things we launched - with bugs.
* documentation of this process.
* Tagging?
* Examples?/Samples? (our current stock of things should be enough)
* add-ons!
* Tests: functional/integration (selenium?)
* Scripts?
* Packaging add-ons
* Running add-on (or combinations of add-ons)
* Generating an update.xml to test
