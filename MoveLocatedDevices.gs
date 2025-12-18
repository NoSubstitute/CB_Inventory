// The maximum runtime for a single execution in milliseconds. (25 minutes)
const MOVE_MAX_RUNTIME_MS = 25 * 60 * 1000;

// =========================================================================================
// == Main function called by the user to start the move process
// =========================================================================================
function moveLocatedDevices() {
  const config = getMoveLocatedDevicesConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getMoveLocatedDevicesConfig() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("Located");
    
    if (!sheet || sheet.getLastRow() < 2) {
      return { error: 'No devices listed in "Located" sheet.' };
    }

    const totalCount = sheet.getLastRow() - 1;

    // Force cold start: Clear any previous job state
    JobManager.clearJob();
    
    return {
      title: 'Move Devices',
      itemCount: totalCount,
      startFunction: 'startMoveProcess'
    };
  } catch (e) {
    return { error: "Error initializing Move Devices: " + e.message };
  }
}

// =========================================================================================
// == Triggered start function (called by the Sidebar "Start" button)
// =========================================================================================
function startMoveProcess() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("Located");
  
  // Cleanup any old triggers
  JobManager.cleanupAllTriggers();
  
  const totalCount = sheet.getLastRow() - 1;

  // Initialize the job state using JobManager
  JobManager.initJob('Move Devices', totalCount);
  
  // Run a short batch IMMEDIATELY to give instant feedback.
  processMoveBatch(true);
}

// =========================================================================================
// == Core processing function, run by triggers (and initially by startMoveProcess)
// =========================================================================================
function processMoveBatch(arg) {
  // Check if arg is strictly true (manual short run); otherwise it's a trigger event object (long run)
  const isShortRun = (arg === true);
  
  const startTime = Date.now();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet, logsheet;
  try {
    sheet = spreadsheet.getSheetByName("Located");
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
    JobManager.cleanupAllTriggers();
    return;
  }
  
  // Check for cancellation
  if (JobManager.isJobCancelled()) {
    JobManager.updateJob(status.processedCount, "Move cancelled by user.", true);
    JobManager.cleanupAllTriggers();
    return;
  }
  
  let currentIndex = status.processedCount;

  // Load the full list of devices
  // Columns A-G (7 columns): DeviceID, Serno, OU, Location, Asset, User, Note
  const deviceList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();

  let pendingLogs = [];

  try {
    for (var i = currentIndex; i < deviceList.length; i++) {
      // Check Cancellation
      if (JobManager.isJobCancelled()) {
        flushLogs(logsheet, pendingLogs);
        JobManager.updateJob(i, "Move cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      // Update Status via JobManager every 50 items
      if (i % 50 === 0) {
        JobManager.updateJob(i, "Moving devices...");
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
      }
      
      // SHORT RUN CHECK / TIMEOUT CHECK
      if (isShortRun && i >= currentIndex + 50) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > MOVE_MAX_RUNTIME_MS) {
         break;
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      let serno = rowData[1];
      
      try {
        if (!deviceId || deviceId.toString().trim() === "") {
           // Skip empty IDs
        } else {
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
          
              let logMessage = `Successfully moved: ` + (updateDetails.length > 0 ? updateDetails.join(', ') : 'No specific fields provided for update.');
              pendingLogs.push([new Date(), userEmail, serno, logMessage]);

          } else {
              pendingLogs.push([new Date(), userEmail, serno, `No update data provided in sheet.`]);
          }
        }
      } catch (err) {
        pendingLogs.push([new Date(), userEmail, serno, `Error: ${err.message}`]);
      }
    }

    flushLogs(logsheet, pendingLogs);

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processMoveBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Move complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    JobManager.updateJob(currentIndex, "An unexpected error occurred: " + e.message, true, e.message);
    Logger.log(`Move process failed: ${e.toString()}\n${e.stack}`);
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