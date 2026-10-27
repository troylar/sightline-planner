# Using OneDrive

Sightline opens the plan file on your computer. OneDrive carries that file between computers. A successful Sightline save confirms a local save; it does not confirm that teammates have received it.

## Set up the shared plan

1. Put the shared JSON or YAML plan in a team folder that everyone using it is allowed to read and edit.
2. On each computer, make the plan and any connected Jira files available offline. In File Explorer or Finder, choose **Always keep on this device**. Microsoft documents this option for offline availability in [Sync SharePoint files and folders](https://support.microsoft.com/en-us/onedrive/sync/sharepoint-training/sync-sharepoint-files-and-folders).
3. Wait for OneDrive to finish downloading the folder, then open Sightline in Edge or Chrome. Choose **File → Open shared plan** and select the local file. Connect the local Jira folder if your team uses it.
4. Leave **File → Check for teammates' saves every 15 s** on to pick up local changes; this is enabled by default unless you previously turned it off. Use **Refresh** before starting work. Check OneDrive's own status before handing the plan to a teammate.
5. Edit one at a time: **Start editing**, **Save**, then **Done editing**. Agree who is editing when a computer is offline or sync is paused.

OneDrive and your organization control folder access. Sightline's views, author stamps and edit lock are not access controls.

## Know which version you are seeing

The page shows its last confirmed local read or save. Automatic checks can notice a teammate's save only after OneDrive delivers it to your computer. Refreshing Sightline does not force a cloud download. Use OneDrive's status to check upload/download progress.

The edit lock is stored in the same shared file, so it also travels through OneDrive. Two offline computers can each believe editing is available. Sightline checks local content before saving, keeps backups for detected clashes, and preserves unsaved drafts, but it cannot guarantee that an unseen cloud update will never cross a save. Keep both versions if OneDrive produces a conflict copy.

If another person starts editing while you have unsaved changes, Sightline keeps your browser copy, undo history and recovery draft. Review the conflict choices before replacing either version. After a file-read failure, **Try again** reconnects from your current browser contents, including edits made since the failure. An unchanged file preserves your edits; a changed file is merged or presented for conflict review. When you and a teammate both change what the same task or initiative waits for, both sets of links are kept, and a link one of you removed stays removed. A link that would make work wait for itself through the other person's links isn't merged: their version wins, yours is backed up, and Sightline says which link wasn't kept and why. A newer unsupported file format keeps your edits available for download and requires updating Sightline before saving.

## Keep assistant folders personal

Keep the shared plan where the team can access it. Connect each person's assistant to a separate private folder for each device and plan, with one active Sightline tab writing to that folder. A local folder is simplest. If you sync the assistant folder, use distinct device folders rather than having two devices write the same outputs.

Sightline writes context and results; your assistant writes proposed changes. Names, people and work descriptions in these files are team information. Give the folder only the access it needs. Browser permission to open a folder does not make it private.

Context and results are separate files. Before combining them, compare the plan revision and Jira sync timestamp. Results reflect the reviewing browser's Apply, Skip and edited operations, not a shared audit log. Unchanged navigation and polls do not repeatedly rewrite outputs. See [Work with your assistant](assistant-workflow.md) for the connection steps.

## Review a conflict copy

Keep the live plan and conflict copy under their existing names. Choose **File → Review another copy…** and select the copy. The **Review another plan copy** dialog compares it with the current shared file without changing either file. Read the warning about work found in the current plan but missing from the copy. A later timestamp does not establish that the copy is the right version.

Choose **Download both copies** to keep separate backups, or **Decide later** to leave the live plan alone. If you deliberately want the entire copy as your starting point, choose **Use this copy to edit**. Confirm the warning: a later Save can replace current contents and remove newer work. Sightline downloads both originals, marks the shared plan as being edited, and prepares the copy as unsaved edits. It does not automatically save the copy's contents or select individual fields to recover.

Inspect the draft, restore any newer work you intend to keep, then use normal **Save** and **Done editing**. Previewing never deletes work. Copy contents reach the shared plan only after your explicit choice and Save. Finish or put aside existing unsaved edits before starting a review; a different plan, a newer unsupported format, different plan dates or sprint settings, another person's active edit lock, or a shared file that changed during review must be addressed first. Keep those copies for a separate comparison.

## When an update doesn't stay saved

After a quick update, Sightline reads the file again. If a save at the same moment overwrote the update, it is put back, once. If the file changes back again, something keeps restoring an older version: another open copy of the plan (another tab, browser or computer) or a sync tool such as OneDrive. Sightline stops, downloads your version as a backup and says so in a red notice, naming whoever saved the file last when the file says. Close the other copies, let OneDrive finish syncing, open the plan in one tab and make the change again.

## Two-device check before a team rollout

**Not executed:** no real OneDrive two-device environment was available for this change. The matrix below is a manual check to perform on your organization's actual computers and sync configuration. Browser file-operation tests use simulated file handles; they do not prove cloud synchronization or conflict-copy behavior.

Create an isolated test folder on OneDrive. Copy `test/fixtures/sample-plan.json` into it as `sync-check.json`; it contains invented people and work. Use the same Sightline build on both computers. Download and pin the test file on both, confirm OneDrive is up to date, and preserve an initial backup outside the shared folder. Use private, distinct assistant folders. Do not connect real Jira or use a real team plan for this check.

Record the operating systems, browser and OneDrive versions, Sightline version, device labels A/B, and each computer's local plan revision. For each case, note what OneDrive reports, what Sightline reports, the file values on both devices, and whether a backup or conflict copy exists. A changed timestamp alone is not proof that both edits survived.

| Case | Try | Check and expected limitation | Result |
|---|---|---|---|
| Normal handoff | A changes an invented task, saves and finishes editing. After OneDrive finishes, B refreshes. | B sees A's value and revision. Record sync delay; Sightline cannot make the cloud delivery immediate. | Not run |
| Offline then reconnect | Take A offline. Edit and save an invented field. Confirm B still sees its earlier local copy. Reconnect A, wait for OneDrive, then refresh B. | A can save locally. B must not be assumed current while A is offline. Both eventually show the intended value, or a clash/copy remains available for review. | Not run |
| Simultaneous different fields | With both devices at the same initial revision, pause sync or take both offline. A and B change different fields, save, then reconnect both. | Inspect the actual resulting files. Local checks cannot serialize unseen remote writes. Do not count this as passing if one edit disappears without a recoverable version. | Not run |
| Simultaneous same field | Repeat with different values for the same invented field. Preserve both values before reconnecting. | A disagreement must remain reviewable through the final file, backups or a conflict copy. Do not expect Sightline to infer which value is correct. | Not run |
| File replacement | With B displaying a clean test plan, replace A's local test file with a valid copy under the same filename; let it sync. Refresh B. | B must show the replacement or a clear read/reconnect problem. Replacing a file may affect remembered browser handles; reconnect if needed. Never repeat this on a real plan. | Not run |
| Browser reconnect | Close and reopen Sightline on B, then reconnect the plan and private assistant folder if prompted. | Permission prompts are browser-local. Confirm the correct plan/device folder and that another device's outputs are not overwritten. | Not run |
| Unsaved work during interruption | On a synthetic plan, keep an unsaved field edit on B. Have A acquire the lock, then let B try Start editing. Separately interrupt B's file access, type another edit, and use Try again after restoring access. | B's latest contents and undo history remain available. A changed file is merged or requires conflict review; refusing a lock never discards B's draft. Confirm actual browser/file-provider behavior. | Not run |
| Conflict-copy review | If a conflict copy is produced, preserve it and the live file. Compare their invented changes without replacing either. If none is produced, create an explicitly labeled synthetic divergent copy for the review exercise. | A synthetic copy tests review, not OneDrive's conflict handling. Preview changes neither file, missing current-only work is reported, and both originals can be downloaded. Replacing contents requires explicit copy choice and normal Save. | Not run |

After each case, restore the synthetic baseline only when all test copies and outcomes have been recorded. Pause test editing until both devices are at the same baseline. Keep results separate from real team work.
