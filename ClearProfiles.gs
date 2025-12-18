// The maximum runtime for a single execution in milliseconds. (25 minutes)
const CLEAR_PROFILES_MAX_RUNTIME_MS = 25 * 60 * 1000;

// =========================================================================================
// == Main function called by the user to start the clear profiles process
// =========================================================================================
function clearProfiles() {
  const config = getClearProfilesConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getClearProfilesConfig() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("UpdateCBs");
  
  if (!sheet || sheet.getLastRow() < 2) {
    return { error: 'No devices listed in "UpdateCBs" sheet.' };
  }

  const totalCount = sheet.getLastRow() - 1;

  // Force cold start: Clear any previous job state
  JobManager.clearJob();
  
  return {
    title: 'Clear Profiles',
    itemCount: totalCount,
    startFunction: 'runClearProfilesJob'
  };
}

// =========================================================================================
// == Triggered start function (called by the Sidebar "Start" button)
// =========================================================================================
function runClearProfilesJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("UpdateCBs");
  
  JobManager.cleanupAllTriggers();
  
  const totalCount = sheet.getLastRow() - 1;

  // Initialize the job state using JobManager
  JobManager.initJob('Clear Profiles', totalCount);
  
  // Run a short batch IMMEDIATELY to give instant feedback.
  processClearProfilesBatch(true);
}


// =========================================================================================
// == Core processing function, run by triggers (and initially by runClearProfilesJob)
// =========================================================================================
function processClearProfilesBatch(arg) {
  // Check if arg is strictly true (manual short run); otherwise it's a trigger event object (long run)
  const isShortRun = (arg === true);
  
  const startTime = Date.now();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet, logsheet;
  try {
    sheet = spreadsheet.getSheetByName("UpdateCBs");
    logsheet = spreadsheet.getSheetByName("Log");
  } catch (e) {
    console.error("Failed to access sheets in background: " + e.message);
    JobManager.updateJob(0, "Error accessing sheets: " + e.message, true, e.message);
    JobManager.cleanupAllTriggers();
    return;
  }

  const userEmail = Session.getActiveUser().getEmail();

  // Get Job State from JobManager
  let status = JobManager.getJobStatus();
  if (!status || status.isFinished || status.error) {
    // Job already finished, cancelled, or error. Clean up and exit.
    JobManager.cleanupAllTriggers();
    return;
  }
  
  // Check for cancellation at the very beginning of the batch
  if (JobManager.isJobCancelled()) {
    JobManager.updateJob(status.processedCount, "Clear Profiles cancelled by user.", true);
    JobManager.cleanupAllTriggers();
    return;
  }
  
  let currentIndex = status.processedCount;

  // Load the full list of devices to update
  // We only need the first two columns: DeviceID and Serial Number
  const deviceList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  
  let pendingLogs = [];

  try {
    for (var i = currentIndex; i < deviceList.length; i++) {
      // Check Cancellation
      if (JobManager.isJobCancelled()) {
        flushLogs(logsheet, pendingLogs);
        JobManager.updateJob(i, "Clear Profiles cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      // Update Status via JobManager every 50 items for responsive UI
      if (i % 50 === 0) {
        JobManager.updateJob(i, "Clearing profiles...");
        flushLogs(logsheet, pendingLogs); // Write logs in batches
        pendingLogs = [];
      }
      
      // SHORT RUN CHECK / TIMEOUT CHECK
      if (isShortRun && i >= currentIndex + 50) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > CLEAR_PROFILES_MAX_RUNTIME_MS) {
         break;
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      let serno = rowData[1];
      
      try {
        if (!deviceId || deviceId.toString().trim() === "") {
          pendingLogs.push([new Date(), userEmail, serno, "Device ID missing - skipping."]);
          continue; // Skip processing this row
        }

        // Use AdminSDK API to issue the WIPE_USERS command directly using DeviceID
        AdminDirectory.Customer.Devices.Chromeos.issueCommand(
          {"commandType": "WIPE_USERS"},
          'my_customer',
          deviceId
        );
        
        pendingLogs.push([new Date(), userEmail, serno, "Request to clear profiles sent"]);

      } catch (err) {
        pendingLogs.push([new Date(), userEmail, serno, `Error: ${err.message}`]);
      }
    }

    // Final batch write for logs
    flushLogs(logsheet, pendingLogs);

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processClearProfilesBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Clear Profiles complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    JobManager.updateJob(currentIndex, "An unexpected error occurred: " + e.message, true, e.message);
    Logger.log(`Clear Profiles process failed: ${e.toString()}\n${e.stack}`);
    JobManager.cleanupAllTriggers();
  }
}

function flushLogs(sheet, logs) {
  if (logs && logs.length > 0) {
    try {
      sheet.getRange(sheet.getLastRow() + 1, 1, logs.length, logs[0].length).setValues(logs);
      SpreadsheetApp.flush();
    } catch (e) {
      console.error("Failed to write logs: " + e.message);
    }
  }
}
