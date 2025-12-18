function getAboutContent() {
  return `CB_Inventory - ChromeOS Device Management
https://github.com/NoSubstitute/CB_Inventory

The easiest way to update this script is to grab a new copy of the template here:
https://docs.google.com/spreadsheets/d/1IuVHMwsPDPjVk-1flzhft-q3SifPFHJSPEq4182CVTM/copy

If you ever need to reach me, I'm available everywhere:
https://wheretofind.me/@NoSubstitute

=== Changelog ===
2025-12-18.15: Further restricted OAuth scopes: Limiting spreadsheet access to "currentonly" (only the active file) and maintaining "admin.directory.user.readonly".
2025-12-18.14: Restricted "admin.directory.user" OAuth scope to "readonly" as the application only reads user data to locate organizational units.
2025-12-18.13: Finalized project by removing unused "Diagnosis.gs" script and the unnecessary "external_request" OAuth scope.
2025-12-18.12: Simplified the sidebar window title to "CB_Inventory" for a cleaner UI.
2025-12-18.11: Fixed a critical bug in DeprovisionDevices.gs where inconsistent column counts in log entries caused batch writes to fail. Standardized flushLogs across all modules with SpreadsheetApp.flush() for immediate visibility.
2025-12-18.10: Standardized Update process name to processUpdateBatch and fixed a bug where the process could stall after the first 50 items. Applied "trigger-on-demand" logic to all core functions to prevent redundant background triggers.
2025-12-18.09: Refined UI transitions to eliminate flicker on progress screens. Implemented "Deep Navigation" memory so "Back" buttons return to the correct sub-menu. Added skip logic to FindUserOUs to ignore rows with missing Device IDs.
2025-12-18.08: Standardized naming to "CB_Inventory" across all files, titles, and notifications.
2025-12-18.07: Fixed critical stalling issue in JobManager._findLastPopulatedRow and eliminated sheet-scanning overhead in ExportDevices.gs for 100x faster processing.
2025-12-18.06: Resolved overlapping worker execution bug and implemented persistent progress tracking in the sidebar status message.
2025-12-18.05: Added "About CB_Inventory" menu item.
2025-12-18.04: Cleaned up menu.gs by removing legacy code and consolidating functionality into the "Start" sidebar.
2025-12-18.03: Refactored UI to use a unified navigation sidebar. Added "Start" menu item. Implemented Main Menu, Sub-Menus (Relocate, Clear, Deprovision), and "Back" navigation within Sidebar.html. Updated menu.gs to include "Start" option and helper function.
2025-12-18.02: Simplified Export Devices UI in Sidebar.html by hiding all progress metrics for indeterminate jobs and increasing polling to 10s to minimize overhead. Improved Export responsiveness by moving cancellation checks to the inner page loop (every 200 items).
2025-12-18.01: Added visual feedback (loading state) to main menu buttons in Sidebar.html to improve perceived responsiveness.
2025-12-17.11: Enhanced JobManager.gs stability with improved lock wait times, safer state handling, and global trigger cleanup to prevent "Too many triggers" errors.
2025-12-17.10: Implemented rate limiting and exponential backoff in Enable/Disable functions to handle API quota limits.
2025-12-17.09: Implemented global trigger cleanup in JobManager.cleanupAllTriggers() to prevent "Too many triggers" errors by removing all batch processing triggers (Update, Enable, Disable, Clear, Powerwash, Deprovision, Move, FindOUs) before starting a new job.
2025-12-17.08: Enhanced JobManager.gs stability by increasing lock wait times, using tryLock for safer operations, adding 500ms delay, and forcing a SpreadsheetApp.flush() before showing the sidebar to resolve UI rendering issues.
2025-12-17.07: Implemented rate limiting and exponential backoff in DisableDevices.gs to handle "Quota exceeded" errors from the Admin SDK API.
2025-12-17.06: Added SpreadsheetApp.flush() to DisableDevices.gs to ensure logs are immediately committed to the sheet.
2025-12-17.05: Standardized error logging in DisableDevices.gs to match the project's new logging format (Date, User, Serial, Error Message).
2025-12-17.04: Optimized RemotePowerwash.gs to use Device ID directly from the 'UpdateCBs' sheet (Column A) instead of querying by Serial Number, reducing API calls.
2025-12-17.03: Refactored RemotePowerwash.gs to use JobManager for batch processing and sidebar integration, matching the pattern of UpdateDevices.gs and ClearProfiles.gs.
2025-12-17.02: Optimized ClearProfiles.gs to use Device ID directly from the 'UpdateCBs' sheet (Column A) instead of querying by Serial Number, reducing API calls.
2025-12-17.01: Refactored ClearProfiles.gs to use JobManager for batch processing and sidebar integration, matching the pattern of UpdateDevices.gs.
2025-12-16.10: Implemented batched log writing in all device management functions to reduce Sheet API calls and improve execution speed.
2025-12-16.09: Increased maximum runtime per batch from 4.5 minutes to 25 minutes in UpdateDevices, DisableDevices, EnableDevices, DeprovisionDevices, MoveLocatedDevices, RemotePowerwash, ClearProfiles, and FindUserOUs to optimize performance for Workspace accounts.
2025-12-16.08: Added error handling (try/catch) and startup toast notifications to MoveLocatedDevices and FindUserOUs to improve debugging and user feedback.
2025-12-16.07: Refined data writing in FindUserOUs to use JobManager._findLastPopulatedRow for accurate appending to Located sheet, avoiding blank rows.
2025-12-16.06: Disabled initial "Cancel" button in sidebar once "Start" is clicked to improve UI clarity.
2025-12-16.05: Renamed 'remotePowerwash' function back to 'powerWash' in RemotePowerwash.gs to fix menu binding error.
2025-12-16.04: Standardized batching logic, fixed error logging format, and added SpreadsheetApp.flush() across all device management functions (DeprovisionDevices, ClearProfiles, EnableDevices, DisableDevices, RemotePowerwash).
2025-12-16.03: Fixed Remote Powerwash to use correct API method (issueCommand) and parameter (REMOTE_POWERWASH).
2025-12-16.02: Added robust pre-checks to Remote Powerwash and Clear Profiles to verify device existence/provisioning before issuing commands, preventing API 404 errors.
2025-12-16.01: Fixed JSON syntax error in appsscript.json and ensured external_request OAuth scope is correctly added, supporting UrlFetchApp usage.
`;
}