# Pixory Personal System Final Acceptance Matrix

Updated: 2026-05-05

Status legend:

- `Planned`: requirement is part of the final implementation target.
- `Done`: implemented and verified.
- `Blocked`: cannot be completed without an external decision or dependency.
- `Deferred`: intentionally not part of the current final pass.

All items are marked `Planned` at documentation handoff time.

| Requirement | Target Behavior | Implementation Area | Automated Test | Android Manual Test | Status |
| --- | --- | --- | --- | --- | --- |
| Normal home excludes private IPs | Home in normal mode lists only normal IPs. | Home routing and normal DB queries | Normal home query defaults to normal only | Create private IP, return home, verify absent | Planned |
| Normal mode cannot create private IP | Private IP creation appears only after Personal System unlock. | Create IP flow, Personal System dashboard | CreateIpScreen has no private option in normal route | Normal create IP screen shows only normal creation | Planned |
| Normal search excludes private IPs | Private IP names do not appear in normal global search. | GlobalSearchScreen, route space | Search tests seed private data and assert no normal result | Search private IP name in normal mode | Planned |
| Normal search excludes private images | Private filenames, notes, tags, groups are not searchable in normal mode. | ImageRepository search and normal route | Search private filename/note/tag/group from normal query returns empty | Search private filename and note | Planned |
| Normal tags exclude private tags | Tags tab uses only normal DB. | TagsOverviewScreen | Tags overview normal query excludes personal DB | Private-only tag absent from normal Tags tab | Planned |
| Normal groups exclude private groups | Groups tab uses only normal DB. | GlobalGroupsScreen | Groups overview normal query excludes personal DB | Private-only group absent from normal Groups tab | Planned |
| Normal favorites exclude private images | Favorites in normal mode lists only normal DB favorites. | FavoritesScreen | Favorites route defaults to normal space | Favorite private image, verify normal favorites empty | Planned |
| Normal recent excludes private images | Normal recent viewed ignores personal lastViewedAt records. | RecentViewedScreen, viewer context | Recent route defaults normal; viewer updates personal in personal routes | View private image, return normal recent, verify absent | Planned |
| Normal trash excludes private data | Normal trash lists only normal deleted images/IPs. | TrashScreen, trashService | Trash route defaults normal | Delete private image/IP, verify normal trash absent | Planned |
| Normal stats exclude private data | Me screen counts only normal DB and normal file size. | MeScreen stats | Count queries default normal | Compare counts before/after private import | Planned |
| Normal covers exclude private thumbnails | Normal IP cards and covers never use personal thumbnails. | IpRepository library items, home cards | Home cover query uses normal DB only | Private import does not change normal covers | Planned |
| Normal import batches exclude private data | Normal import history and duplicate review see only normal batches. | ImportBatchHistoryScreen, DuplicateReviewScreen | Import batch route carries normal space | Private package import absent from normal history | Planned |
| Normal quick organize excludes private data | Normal quick organize uses only normal images. | QuickOrganizeScreen | Quick organize route defaults normal | Private ungrouped image absent from normal queue | Planned |
| Normal logs exclude private values | Normal-mode logs do not output private names, paths, thumbnails, notes, or records. | devLog and regression services | Source/policy test for redaction and no personal dump | Inspect normal regression logs | Planned |
| Personal System entry exists | Me page has a clear Personal System entry. | MeScreen | Entry key and route exist | Open Me page and see Personal System | Planned |
| First entry requires password setup | No credential means setup screen is shown. | PersonalSystemScreen | Credential absence path tested | Fresh install opens setup | Planned |
| Setup warns about unrecoverable password | Setup copy says forgotten password cannot be recovered and reset clears personal data. | PersonalSystemScreen copy | Source/policy test for warning text | Verify setup copy | Planned |
| Password is not stored plain text | SecureStore stores salted hash, not raw password. | personalSystemService | Credential schema test | Not applicable beyond source review | Planned |
| Entry requires password verification | Existing credential requires verification before content. | PersonalSystemScreen, app lock state | Verify function and route guard tests | Restart app, enter Personal System, password required | Planned |
| Five wrong attempts lock temporarily | Five failures trigger delay lockout. | personalSystemService | Existing and expanded lockout tests | Enter wrong password five times | Planned |
| Change password requires old password | Change password UI verifies current password first. | PersonalSystemScreen, personalSystemService | Change password tests | Change password with wrong and right old password | Planned |
| Forgot password clears personal data | Reset deletes personal DB/directories and credential only. | personalSystemService | Reset tests assert normal data intact | Reset personal, verify normal data remains | Planned |
| Cold start locks Personal System | App launch starts locked. | App lock state | App initialization test/policy | Force close and reopen | Planned |
| Background relocks Personal System | App background or lock screen relocks. | AppState handling | AppState route guard policy | Background app, return, verify lock screen | Planned |
| Exit Personal System relocks | Explicit exit clears unlocked state. | PersonalSystemScreen, App state | Exit action policy | Exit, re-enter, password required | Planned |
| Personal DB is separate | Personal data uses `pixory_personal.sqlite`. | db.ts, schema.ts | Existing DB policy test | Inspect app-private DB names if needed | Planned |
| Personal dirs are separate | Personal files use `pixory_personal/originals`, thumbnails, temp, exports. | fileStorageService | Existing storage policy test | Import private image, inspect URI/path | Planned |
| Private IP not in normal DB | Creating private IP writes only personal DB. | Create IP flow, runWithDatabaseSpace | DB separation test | Create private IP, normal home absent | Planned |
| Private originals not in normal originals | Private imports write only personal originals. | imageImportService, fileStorageService | Storage path test | Inspect image detail URI in Personal System | Planned |
| Private thumbnails not in normal thumbnails | Private imports write only personal thumbnails. | thumbnailService | Storage path test | Inspect thumbnail URI | Planned |
| Reset clears personal data | Reset deletes personal DB and personal dirs. | personalSystemService | Reset policy test | Reset, verify private IPs gone | Planned |
| Reset does not affect normal data | Normal DB and files remain after reset. | personalSystemService | Reset normal preservation test | Reset personal, normal home unchanged | Planned |
| Personal System shows normal and private IPs | Unlocked dashboard lists both spaces. | PersonalSystemScreen dashboard | Combined list includes space | Unlock and verify both sections | Planned |
| Personal System create normal/private IP | Create IP offers `普通 IP` and `隐私 IP`. | Create IP dashboard flow | Create flow route tests | Create one of each | Planned |
| Private UI suffix is display-only | `(ps)` appears only in UI, not stored name. | display helper | DB name test excludes suffix | Open edit private IP and verify raw name | Planned |
| Private IP supports full detail | Private IP opens complete IP detail. | route space, IpDetailScreen | IpDetailScreen uses space | Open private IP detail | Planned |
| Private IP supports edit/delete/restore/permanent delete | IP lifecycle works in personal DB and files. | EditIpScreen, TrashScreen, ipDeletionService | Personal IP lifecycle tests | Soft delete, restore, permanent delete private IP | Planned |
| Private image detail works | Preview, note, favorite, move group work. | ImageDetailScreen, EditImageScreen, MoveImageGroupScreen | Image mutation space tests | Edit private image metadata | Planned |
| Private groups work | Create/edit/delete/filter private groups. | Group screens | Group route space tests | Manage private groups | Planned |
| Private tags work | Create/display/search/add/remove private tags. | Tags screens and tag repository calls | Tag route space tests | Manage private tags | Planned |
| Private favorites work | Favorite private images appear in Personal System favorites only. | FavoritesScreen combined mode | Favorite route space tests | Favorite private image | Planned |
| Private recent works | Personal recent shows private views; normal recent does not. | Viewer context, RecentViewedScreen | Recent space tests | View private image | Planned |
| Private trash works | Personal trash shows private deleted items only in Personal System. | TrashScreen combined/personal mode | Trash space tests | Delete private image | Planned |
| Private quick organize works | Personal quick organize can process private images. | QuickOrganizeScreen | Quick organize space tests | Run quick organize on private IP | Planned |
| Private duplicate review works | Duplicate review runs per personal import batch. | DuplicateReviewScreen | Duplicate route space tests | Import duplicate private package | Planned |
| Private import batch history works | Personal batches appear only in Personal System. | ImportBatchHistoryScreen | Batch space tests | View private import history | Planned |
| Same names do not conflict | Normal and private same-name IP/group/tag can coexist. | Separate DB spaces and display helper | Same-name tests | Create same names in both spaces | Planned |
| Import supports `.zip` | File picker accepts zip. | packageImportService, ImportImagesScreen | Existing and expanded policy tests | Pick zip on Android APK | Planned |
| Import supports `.pixorypack` as resource package | File picker accepts pixorypack for resource import. | packageImportService | Existing and expanded policy tests | Pick pixorypack on Android APK | Planned |
| Package copied to private temp | Selected package is copied before unzip. | packageImportService | Existing policy test | Inspect flow/log safely | Planned |
| Unzip occurs in current space temp | Normal uses normal temp; private uses personal temp. | packageImportService | Existing and expanded space tests | Private package import path check | Planned |
| Temp cleaned after import | Package and extract temp are deleted. | packageImportService | Cleanup tests/policy | Import then inspect temp | Planned |
| Folder maps to group | Folder names create/reuse groups. | packageImportService | Existing plus behavior tests | Import `春节/001` | Planned |
| Multi-level folder uses nearest folder | Deep file uses closest parent as group. | resolvePackageGroupName | Unit/policy test | Import `A/B/C.png`, verify group `B` | Planned |
| Root images import ungrouped or manual groups | Root files import without folder group. | packageImportService | Root image test | Import root image | Planned |
| Same group reused | Existing group not duplicated. | groupRepository lookup | Reuse test | Import same package twice | Planned |
| No-extension images recognized | Magic bytes identify extensionless files. | detectImageTypeFromMagicBytes | Existing and expanded tests | Import no-extension PNG/JPEG/WebP | Planned |
| Supported image formats | PNG/JPEG/WebP/GIF/BMP supported. | packageImportService | Existing MIME policy test | Import sample formats | Planned |
| Unsupported files skipped with reason | Skipped file result records include reason. | import_batch_items | Skipped reason test | Import manifest/txt file | Planned |
| Single file failure does not block package | Continue after item failure. | packageImportService | Partial failure test | Import package with broken image | Planned |
| DB failure deletes copied files | Orphan original/thumbnail cleanup on DB failure. | imageImportService/package import | Failure cleanup test | Simulated or debug validation | Planned |
| Private package import stays personal | Private import writes only personal DB and dirs. | ImportImagesScreen, packageImportService | Personal import space test | Import package into private IP | Planned |
| Original files not re-encoded | Originals copied as-is. | fileStorageService | Source/policy test | Compare file size/hash when possible | Planned |
| Thumbnails are separate previews | Thumbnails generated separately. | thumbnailService | Existing storage policy test | Inspect original and thumbnail URIs | Planned |
| Zip Slip blocked | Path traversal cannot write outside temp. | assertSafeExtractedPath | Existing and expanded tests | Malicious package test if available | Planned |
| Package size limit enforced | Oversized package rejected before import. | packageImportService | Limit test/policy | Manual large file if needed | Planned |
| Uncompressed size limit enforced | Zip bomb-like package rejected. | getUncompressedSize | Existing policy test | Manual large uncompressed package | Planned |
| File count limit enforced | Too many files rejected. | scanExtractedFiles | Existing policy test | Manual stress package if needed | Planned |
| Directory depth limit enforced | Too-deep package rejected. | scanExtractedFiles | Existing policy test | Manual deep package if needed | Planned |
| Space shortage handled safely | Import refuses or aborts safely with no inconsistent data. | packageImportService preflight | Policy/unit test if feasible | Low-space manual scenario if feasible | Planned |
| Failed import leaves no orphan DB records | Failed items do not create false success records. | package import transaction/cleanup | Failure tests | Broken package import | Planned |
| Failed import leaves no undeclared orphan files | Files are cleaned unless declared successful. | cleanupFailedImport | Failure cleanup test | Broken package import path check | Planned |
| Import does not save to system album | No MediaLibrary save call during import. | import services | Source policy test | Android gallery absent | Planned |
| Imported files absent from Android gallery | App-private originals are not scanned. | storage directories | Not reliable as unit test | Android Gallery check | Planned |
| Normal full backup normal-only | Normal full backup includes only normal data. | backupService | Existing and expanded backup test | Export normal backup and inspect manifest | Planned |
| Normal IP export normal-only | Normal IP export allows only normal IPs. | BackupScreen/createIpBackup | Backup UI test/policy | Private IP absent from normal backup UI | Planned |
| Normal export excludes personal DB | `pixory_personal.sqlite` never in normal export. | backupService | Existing test | Inspect normal backup files | Planned |
| Normal manifest excludes private values | Private names/tags/paths/thumbnails absent. | backupService manifest builder | Manifest test | Inspect manifest | Planned |
| Personal export options exist | Personal System shows export normal/private/all. | Personal backup UI | Source/policy test | Open Personal export UI | Planned |
| Private export requires re-auth | Password is required before private/all export. | backup UI/service | Verification test | Attempt private export | Planned |
| Private export is encrypted `.pixorypack` | Private export writes single encrypted pack. | backupService, zipWithPassword | AES zip policy test | Export and inspect file visibility | Planned |
| Public export warning shown | Warn if private export goes to public/system directory. | Backup UI copy | Copy policy test | Export flow shows warning | Planned |
| Backup includes DB/originals/thumbnails/manifest | Valid backup contains complete data. | backupService | Backup structure test | Inspect backup/pack after decrypt in app | Planned |
| Backup originals are original files | Backup does not substitute thumbnails for originals. | backupService | Source/policy test | Compare exported original | Planned |
| Personal encrypted import only after unlock | Normal mode refuses private encrypted pack inspection. | package/encrypted import UI | Import guard test | Try encrypted pack in normal mode | Planned |
| Encrypted import merges personal data | Pack import adds records without clearing current personal data. | encrypted import service | Merge/remap tests | Import pack with existing private data | Planned |
| Personal empty states complete | Private IP/image/tag/search/trash empty states exist. | Personal System UI and screens | Source/policy test | Fresh Personal System review | Planned |
| Import result details shown | Success, failure, skipped details visible. | Import result screens | import_batch_items tests | Import mixed package | Planned |
| Import processing prevents duplicate submit | Button disabled/loading during import. | ImportImagesScreen | Source/policy test | Tap import repeatedly | Planned |
| Android layout stable | No text overlap, overflow, or content obstruction. | UI styles | Typecheck plus visual review | Android screenshot pass | Planned |
| APK validation used for zip import | Resource import is validated on rebuilt APK, not Expo Go. | Release/QA process | Documentation/checklist | Rebuild and install APK | Planned |
| Android can choose `.zip` and `.pixorypack` | DocumentPicker works for both types. | Native picker integration | Not sufficient as unit test | Android picker test | Planned |
| Android normal/private package imports work | Package imports complete in both spaces. | packageImportService | Automated policy plus APK | Android import tests | Planned |
| Android gallery excludes imported files | App-private imported files do not appear in system gallery. | storage behavior | Not reliable as unit test | Android gallery app check | Planned |
| Android background relocks | Personal System relocks after background. | AppState handling | Policy test | Android background/resume | Planned |
| Full Android regression covered | Home, detail, import, package import, search, tags, groups, favorites, recent, trash, backup. | App integration | Automated checks | Android regression checklist | Planned |
| `pnpm test` passes | Test suite passes. | project tests | `pnpm test` | Not applicable | Planned |
| `pnpm typecheck` passes | TypeScript passes. | project typecheck | `pnpm typecheck` | Not applicable | Planned |
| `expo install --check` passes | Expo dependency versions compatible. | dependencies | `pnpm exec expo install --check` | Not applicable | Planned |
| Privacy policy tests expanded | Normal default, personal DB/dirs, normal export exclusion covered. | tests | new privacy tests | Not applicable | Planned |
| Package import policy tests expanded | DocumentPicker, unzip, limits, magic bytes, folder groups, current space writes covered. | tests | new package tests | Not applicable | Planned |
