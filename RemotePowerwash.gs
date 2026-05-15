// The maximum runtime for a single execution in milliseconds. (25 minutes)
const REMOTE_POWERWASH_MAX_RUNTIME_MS = 25 * 60 * 1000;

// =========================================================================================
// == Main function called by the user to start the remote powerwash process
// =========================================================================================
function powerWash() {
  const config = getPowerWashConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getPowerWashConfig() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("UpdateCBs");

  if (!sheet) {
    return { error: 'Sheet "UpdateCBs" not found.' };
  }

  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  if (lastRow < 2) {
    return { error: 'No devices listed in "UpdateCBs" sheet.' };
  }

  const totalCount = lastRow - 1;

  // Force cold start: Clear any previous job state
  JobManager.clearJob();

  return {
    title: 'Remote Powerwash',
    itemCount: totalCount,
    startFunction: 'runPowerWashJob'
  };
}

// =========================================================================================
// == Triggered start function (called by the Sidebar "Start" button)
// =========================================================================================
function runPowerWashJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("UpdateCBs");
  
  JobManager.cleanupAllTriggers();
  
  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  const totalCount = lastRow - 1;

  JobManager.initJob('Remote Powerwash', totalCount);
  
  processPowerWashBatch(true);
}


// =========================================================================================
// == Core processing function, run by triggers (and initially by runPowerWashJob)
// =========================================================================================
function processPowerWashBatch(arg) {
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
    JobManager.updateJob(status.processedCount, "Remote Powerwash cancelled by user.", true);
    JobManager.cleanupAllTriggers();
    return;
  }
  
  let currentIndex = status.processedCount;

  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  if (lastRow < 2) {
    JobManager.updateJob(0, "No data found.", true);
    JobManager.cleanupAllTriggers();
    return;
  }

  // Load the full list of devices to powerwash
  // We only need the first two columns: DeviceID and Serial Number
  const deviceList = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  
  let pendingLogs = [];
  let i = currentIndex;

  try {
    for (; i < deviceList.length; i++) {
      // Check Cancellation
      if (JobManager.isJobCancelled()) {
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
        JobManager.updateJob(i, "Remote Powerwash cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      // Update Status via JobManager every 50 items for responsive UI
      if (i % 50 === 0) {
        JobManager.updateJob(i, "Remote powerwashing...");
        flushLogs(logsheet, pendingLogs); // Write logs in batches
        pendingLogs = [];
      }
      
      // SHORT RUN CHECK / TIMEOUT CHECK
      if (isShortRun && i >= currentIndex + 50) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > REMOTE_POWERWASH_MAX_RUNTIME_MS) {
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

        // Use AdminSDK API to issue the REMOTE_POWERWASH command directly using DeviceID
        AdminDirectory.Customer.Devices.Chromeos.issueCommand(
          {"commandType": "REMOTE_POWERWASH"},
          'my_customer',
          deviceId
        );
        
        pendingLogs.push([new Date(), userEmail, serno, "Request to powerwash sent"]);

      } catch (err) {
        pendingLogs.push([new Date(), userEmail, serno, `Error: ${err.message}`]);
      }
    }

    // Final batch write for logs
    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processPowerWashBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Remote Powerwash complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];
    JobManager.updateJob(currentIndex, "An unexpected error occurred: " + e.message, true, e.message);
    Logger.log(`Remote Powerwash process failed: ${e.toString()}\n${e.stack}`);
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