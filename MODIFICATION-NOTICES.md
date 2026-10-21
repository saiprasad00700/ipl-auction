# Modification notices

This repository is based on the upstream project:

- Upstream repository: https://github.com/Shaurya01836/ipl-auction
- Upstream licence: Apache License 2.0 (see `LICENSE`)

The source files, workflow/configuration files, and documentation changed or added for this fork are being marked with a notice that they were modified by `saiprasad00700`. Original copyright, attribution, and licence notices must remain intact.

## JSON configuration note

Strict JSON files cannot contain comments without becoming invalid JSON. The changed `.firebaserc` and `package.json` files therefore carry a metadata notice while remaining valid JSON. `database.rules.json` includes a comment notice supported by the Firebase Realtime Database rules format.

This file records the approach taken; it is not a legal opinion that every file-format edge case is conclusively resolved. Review the final distribution and applicable third-party licences before release.
