# Workspace and assistant validation

The version 1.86.0 changes preserve the offline HTML application and plan schema. Synthetic plans are used throughout validation.

## Automated checks

Version 1.86.0 passed **2,322 checks across 102 suites** on October 8, 2026. Run `./build.sh` and `./test/run.sh` to repeat the checks. The runner includes all browser-model harnesses, build validation and the Python Jira-sync tests. New checks cover saved source layers, contextual controls, group navigation, keyboard access, Settings memory, structural-field disclosures, release-note routing, timing labels, automatic assistant context/results, edit-safe refresh, permission loss and plan switches.

The saved-layer checks fail on the original build. The unchanged-export and closed-editor checks fail before their fixes. The Roadmap empty-section regression also fails on the original build. Existing report checks use a fixed fixture date so passing does not depend on today's calendar date; their status, frozen-copy and export assertions remain.

## Real browsers

Firefox smoke checks confirmed the primary destinations, Status update's whole-plan scope, Product updates' release list, final navigation labels and a visible explanatory failure when altered JavaScript is blocked by CSP.

Chrome Incognito completed a real browser File System Access round trip:

1. Connected a new empty synthetic assistant folder and allowed access only to it.
2. Confirmed Sightline created context and results, leaving the proposal file absent.
3. Wrote a synthetic amendments file atomically using the exported plan ID and revision.
4. Observed automatic detection while navigating to Work, without a manual refresh.
5. Reviewed and applied the capability in Sightline.
6. Confirmed it appeared in Product updates and in the refreshed context; results recorded `applied`.
7. Confirmed ordinary navigation and polling left context/results modification times unchanged.

The Chrome smoke used a browser-local synthetic plan. Confirmed shared-file sourcing, dirty shared edits, reconnection and race cases are covered by API mocks; this smoke does not prove every operating-system or sync-service permission behavior. Audience usability still needs the short [human check](usability-test.md).

## Performance

The [benchmark](performance-workspaces.md) records synthetic JavaScript/DOM costs. It does not measure real-browser layout or input latency. The new navigation caches stable controls, and unchanged assistant context is neither reconstructed nor written. Existing large-Jira checks remain in the full suite. Further large-plan optimization should use real-browser profiles, particularly for hidden chart rendering and shared DOM decoration.


## OneDrive follow-up: version 1.87.0

Version 1.87.0 passed **2,372/2,372 checks across 104 suites** on October 8, 2026, after a fresh build. The original checkout remains unchanged. This change touches shared-plan file operations and viewer preferences; it adds no plan schema fields or Jira write access.

`harness102` passed **43/43**: default and opted-out checking, foreground checks, typing begun during a pending read, invalid or moved files, read-only recovery previews, plan identity and calendar validation, stale reviews, permission and dialog cancellation, guarded lock cleanup, crossing saves, deliberate Save, and failed new-file creation. The preceding build fails the new behavior checks. `harness103` passed **7/7**: unchanged shared-file checks update freshness with zero full renders, assistant reconstructions or output writes; an arriving revision refreshes the plan and each output once. Existing `harness4` passed **404/404**, build checks **19/19**, and Jira-sync checks **206/206**.

Firefox executed the final build and showed the explanatory startup failure for an altered-script copy blocked by CSP. Chrome displayed the final release, but native automation did not complete the file picker, so this release's recovery flow has not been verified through a live browser file round trip. API mock checks do not establish operating-system file-provider or cloud synchronization behavior.

No OneDrive installation or second-device test environment was available. The [OneDrive setup and two-device checklist](onedrive.md) records seven live cases as **Not run**, including actual sync delays, offline reconnection, file replacement and conflict copies. A local save remains distinct from OneDrive upload completion.

<details>
<summary>Version 1.87.0 per-suite results</summary>

```text
harness2   25/25 passed
  harness3   15/15 passed
  harness4   404/404 passed
  harness5   10/10 passed
  harness6   95/95 passed
  harness7   46/46 passed
  harness8   50/50 passed
  harness9   44/44 passed
  harness10  38/38 passed
  harness11  56/56 passed
  harness12  37/37 passed
  harness13  27/27 passed
  harness14  20/20 passed
  harness15  35/35 passed
  harness16  36/36 passed
  harness17  35/35 passed
  harness18  16/16 passed
  harness19  44/44 passed
  harness20  9/9 passed
  harness21  16/16 passed
  harness22  11/11 passed
  harness23  12/12 passed
  harness24  16/16 passed
  harness25  17/17 passed
  harness26  23/23 passed
  harness27  7/7 passed
  harness28  13/13 passed
  harness29  20/20 passed
  harness30  16/16 passed
  harness31  14/14 passed
  harness32  10/10 passed
  harness33  14/14 passed
  harness34  8/8 passed
  harness35  14/14 passed
  harness36  22/22 passed
  harness37  16/16 passed
  harness38  15/15 passed
  harness39  25/25 passed
  harness40  21/21 passed
  harness41  15/15 passed
  harness42  9/9 passed
  harness43  12/12 passed
  harness44  14/14 passed
  harness45  5/5 passed
  harness46  7/7 passed
  harness47  9/9 passed
  harness48  9/9 passed
  harness49  8/8 passed
  harness50  8/8 passed
  harness51  8/8 passed
  harness52  11/11 passed
  harness53  17/17 passed
  harness54  10/10 passed
  harness55  8/8 passed
  harness56  21/21 passed
  harness57  15/15 passed
  harness58  18/18 passed
  harness59  12/12 passed
  harness60  10/10 passed
  harness61  11/11 passed
  harness62  23/23 passed
  harness63  6/6 passed
  harness64  12/12 passed
  harness65  4/4 passed
  harness66  7/7 passed
  harness67  20/20 passed
  harness68  18/18 passed
  harness69  5/5 passed
  harness70  10/10 passed
  harness71  17/17 passed
  harness72  21/21 passed
  harness73  9/9 passed
  harness74  3/3 passed
  harness75  8/8 passed
  harness76  8/8 passed
  harness77  16/16 passed
  harness78  12/12 passed
  harness79  12/12 passed
  harness80  11/11 passed
  harness81  12/12 passed
  harness82  10/10 passed
  harness83  10/10 passed
  harness84  9/9 passed
  harness85  6/6 passed
  harness86  9/9 passed
  harness87  8/8 passed
  harness88  7/7 passed
  harness89  15/15 passed
  harness90  4/4 passed
  harness91  7/7 passed
  harness92  9/9 passed
  harness93  6/6 passed
  harness94  11/11 passed
  harness95  7/7 passed
  harness96  12/12 passed
  harness97  17/17 passed
  harness98  12/12 passed
  harness99  61/61 passed
  harness100 36/36 passed
  harness101 18/18 passed
  harness102 43/43 passed
  harness103 7/7 passed
  build      19/19 passed
  jira-sync  206/206 passed
```

</details>
