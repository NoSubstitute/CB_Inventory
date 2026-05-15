// The maximum runtime for a single execution in milliseconds. (25 minutes)
const UPDATE_MAX_RUNTIME_MS = 25 * 60 * 1000;

// =========================================================================================
// == Main function called by the user to start the update process
// =========================================================================================
function updateChromebook() {
  const config = getUpdateChromebookConfig();
  
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }

  // Open the Job Manager Sidebar with confirmation config
  JobManager.showJobSidebar(config);
}

function getUpdateChromebookConfig() {
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
    title: 'Update Devices',
    itemCount: totalCount,
    startFunction: 'runUpdateJob'
  };
}

// =========================================================================================

// == Triggered start function (called by the Sidebar "Start" button)

// =========================================================================================

function runUpdateJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("UpdateCBs");
  
  JobManager.cleanupAllTriggers();
  
  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  const totalCount = lastRow - 1;

  // Initialize the job state using JobManager
  JobManager.initJob('Update Devices', totalCount);
  
  // Run a short batch IMMEDIATELY to give instant feedback.
  // Trigger will be created only if this burst doesn't finish the whole job.
  processUpdateBatch(true);
}


// =========================================================================================
// == Core processing function, run by triggers (and initially by runUpdateJob)
// =========================================================================================
function processUpdateBatch(arg) {
  // Check if arg is strictly true (manual short run); otherwise it's a trigger event object (long run)
  const isShortRun = (arg === true);
  
  const startTime = Date.now();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet(); // May be null in background, but usually works in container-bound
  
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

  const userEmail = Session.getActiveUser().getEmail(); // Might be script owner in background

  // Get Job State from JobManager
  let status = JobManager.getJobStatus();
  if (!status || status.isFinished || status.error) {
    // Job already finished, cancelled, or error. Clean up and exit.
    JobManager.cleanupAllTriggers();
    return;
  }
  
  // Check for cancellation at the very beginning of the batch
  if (JobManager.isJobCancelled()) {
    JobManager.updateJob(status.processedCount, "Update cancelled by user.", true);
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

  // Load the full list of devices to update
  const deviceList = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  let pendingLogs = [];
  let i = currentIndex;

  try {
    for (; i < deviceList.length; i++) {
      // Check Cancellation
      if (JobManager.isJobCancelled()) {
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
        JobManager.updateJob(i, "Update cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      // Update Status via JobManager every 50 items for responsive UI
      if (i % 50 === 0) {
        JobManager.updateJob(i, "Updating devices...");
        flushLogs(logsheet, pendingLogs); // Write logs in batches
        pendingLogs = [];
      }
      
      // SHORT RUN CHECK / TIMEOUT CHECK
      if (isShortRun && i >= currentIndex + 50) {
         break; // End initial burst
      } else if (!isShortRun && Date.now() - startTime > UPDATE_MAX_RUNTIME_MS) {
         break; // Execution time limit reached
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      let serno = rowData[1];
      
      try {
        if (!deviceId || deviceId.toString().trim() === "") {
          pendingLogs.push([new Date(), userEmail, serno, "Device ID missing - skipping."]);
          continue; // Skip processing this row
        }

        let updatePayload = {};
        if (rowData[2] !== null && rowData[2] !== undefined) updatePayload.orgUnitPath = rowData[2].toString();
        if (rowData[3] !== null && rowData[3] !== undefined) updatePayload.annotatedLocation = rowData[3].toString();
        if (rowData[4] !== null && rowData[4] !== undefined) updatePayload.annotatedAssetId = rowData[4].toString();
        if (rowData[5] !== null && rowData[5] !== undefined) updatePayload.annotatedUser = rowData[5].toString();
        if (rowData[6] !== null && rowData[6] !== undefined) updatePayload.notes = rowData[6].toString();

        if (Object.keys(updatePayload).length > 0) {
            AdminDirectory.Chromeosdevices.update(updatePayload, 'my_customer', deviceId);
            
            let updateDetails = [];
            if (updatePayload.orgUnitPath !== undefined) updateDetails.push(`OU: "${updatePayload.orgUnitPath}"`);
            if (updatePayload.annotatedLocation !== undefined) updateDetails.push(`Location: "${updatePayload.annotatedLocation}"`);
            if (updatePayload.annotatedAssetId !== undefined) updateDetails.push(`Asset: "${updatePayload.annotatedAssetId}"`);
            if (updatePayload.annotatedUser !== undefined) updateDetails.push(`User: "${updatePayload.annotatedUser}"`);
            if (updatePayload.notes !== undefined) updateDetails.push(`Note: "${updatePayload.notes}"`);
        
            let logMessage = `Successfully updated: ` + (updateDetails.length > 0 ? updateDetails.join(', ') : 'No specific fields provided for update.');
            pendingLogs.push([new Date(), userEmail, serno, logMessage]);

        } else {
            pendingLogs.push([new Date(), userEmail, serno, `No update data provided in sheet.`]);
        }
      } catch (err) {
        pendingLogs.push([new Date(), userEmail, serno, `Error: ${err.message}`]);
      }
    }

    // Final batch write for logs
    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];

    if (i < deviceList.length) {
        // Not done yet. Reschedule.
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processUpdateBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        // Finished all items
        JobManager.updateJob(deviceList.length, "Update complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];
    JobManager.updateJob(currentIndex, "An unexpected error occurred: " + e.message, true, e.message);
    Logger.log(`Update process failed: ${e.toString()}\n${e.stack}`);
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