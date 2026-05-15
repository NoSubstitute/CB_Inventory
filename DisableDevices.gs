// The maximum runtime for a single execution in milliseconds. (25 minutes)
const DISABLE_MAX_RUNTIME_MS = 25 * 60 * 1000;

// =========================================================================================
// == Main function called by the user to start the process
// =========================================================================================
function disableChromebook() {
  const config = getDisableChromebookConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getDisableChromebookConfig() {
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

  JobManager.clearJob();
  
  return {
    title: 'Disable Devices',
    itemCount: totalCount,
    startFunction: 'runDisableJob'
  };
}

// =========================================================================================
// == Triggered start function
// =========================================================================================
function runDisableJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("UpdateCBs");
  
  JobManager.cleanupAllTriggers();
  
  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  const totalCount = lastRow - 1;

  JobManager.initJob('Disable Devices', totalCount);
  
  processDisableBatch(true);
}

// =========================================================================================
// == Core processing function
// =========================================================================================
function processDisableBatch(arg) {
  const isShortRun = (arg === true);
  const startTime = Date.now();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet, logsheet;
  try {
    sheet = spreadsheet.getSheetByName("UpdateCBs");
    logsheet = spreadsheet.getSheetByName("Log");
  } catch (e) {
    console.error("Failed to access sheets: " + e.message);
    JobManager.updateJob(0, "Error accessing sheets: " + e.message, true, e.message);
    JobManager.cleanupAllTriggers();
    return;
  }

  const userEmail = Session.getActiveUser().getEmail();

  let status = JobManager.getJobStatus();
  if (!status || status.isFinished || status.error) {
    JobManager.cleanupAllTriggers();
    return;
  }
  
  if (JobManager.isJobCancelled()) {
    JobManager.updateJob(status.processedCount, "Cancelled by user.", true);
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

  // Load list. Cols: A(0)=ID, B(1)=Serial
  const deviceList = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

  let pendingLogs = [];
  let i = currentIndex;

  try {
    for (; i < deviceList.length; i++) {
      if (JobManager.isJobCancelled()) {
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
        JobManager.updateJob(i, "Cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      if (i % 50 === 0) {
        JobManager.updateJob(i, "Disabling devices...");
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
      }
      
      if (isShortRun && i >= currentIndex + 50) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > DISABLE_MAX_RUNTIME_MS) {
         break;
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      let serno = rowData[1];
      
      if (!deviceId || deviceId.toString().trim() === "") {
          pendingLogs.push([new Date(), userEmail, serno, "FAILED - Missing Device ID"]);
      } else {
          // Implement simple retry with backoff for quota errors
          var maxRetries = 5;
          var retryDelay = 2000;
          var success = false;
          
          for (var attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              AdminDirectory.Chromeosdevices.action({'action': 'disable'}, 'my_customer', deviceId);
              success = true;
              break;
            } catch (err) {
              if (err.message && (err.message.includes("Quota exceeded") || err.message.includes("Rate Limit Exceeded"))) {
                console.warn(`Quota exceeded for ${serno}. Retrying in ${retryDelay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
                Utilities.sleep(retryDelay);
                retryDelay *= 2; // Exponential backoff
              } else {
                // If it's not a quota error, log it and move on
                pendingLogs.push([new Date(), userEmail, serno, `Error: ${err.message}`]);
                break; 
              }
            }
          }
          
          if (success) {
            pendingLogs.push([new Date(), userEmail, serno, "Device disabled"]);
            // Add a small delay between successful requests to prevent hitting the per-minute limit
            Utilities.sleep(1000); 
          } else if (!success && !pendingLogs.some(log => log[2] === serno)) {
             // If we failed all retries and haven't logged a specific error yet
             pendingLogs.push([new Date(), userEmail, serno, "Failed: Quota exceeded after retries"]);
          }
      }
    }

    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processDisableBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Disable complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];
    JobManager.updateJob(currentIndex, "Error: " + e.message, true, e.message);
    Logger.log(`Disable failed: ${e.toString()}\n${e.stack}`);
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
