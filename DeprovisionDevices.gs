// The maximum runtime for a single execution in milliseconds. (25 minutes)
const DEPROV_MAX_RUNTIME_MS = 25 * 60 * 1000;

// =========================================================================================
// == Main function called by the user to start the process
// =========================================================================================
function deprovisionChromebook() {
  const config = getDeprovisionChromebookConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getDeprovisionChromebookConfig() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("DeprovisionCBs");
  
  if (!sheet || sheet.getLastRow() < 2) {
    return { error: 'No devices listed in "DeprovisionCBs" sheet.' };
  }

  const totalCount = sheet.getLastRow() - 1;

  // Force cold start
  JobManager.clearJob();
  
  return {
    title: 'Deprovision Devices',
    itemCount: totalCount,
    startFunction: 'runDeprovisionJob'
  };
}

// =========================================================================================
// == Triggered start function
// =========================================================================================
function runDeprovisionJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("DeprovisionCBs");
  
  JobManager.cleanupAllTriggers();
  
  const totalCount = sheet.getLastRow() - 1;

  JobManager.initJob('Deprovision Devices', totalCount);
  
  processDeprovisionBatch(true);
}

// =========================================================================================
// == Core processing function
// =========================================================================================
function processDeprovisionBatch(arg) {
  const isShortRun = (arg === true);
  const startTime = Date.now();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet, logsheet;
  try {
    sheet = spreadsheet.getSheetByName("DeprovisionCBs");
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

  // Load list. Cols: A(0)=ID, B(1)=Serial, C(2)=NewOU, D(3)=Reason
  // Get 4 columns
  const deviceList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();

  let pendingLogs = [];

  try {
    for (var i = currentIndex; i < deviceList.length; i++) {
      if (JobManager.isJobCancelled()) {
        flushLogs(logsheet, pendingLogs);
        JobManager.updateJob(i, "Cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      if (i % 50 === 0) {
        JobManager.updateJob(i, "Deprovisioning devices...");
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
      }
      
      if (isShortRun && i >= currentIndex + 50) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > DEPROV_MAX_RUNTIME_MS) {
         break;
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      let serno = rowData[1];
      let newOU = rowData[2];
      let depReason = rowData[3];
      
      
      try {
        if (!deviceId || deviceId.toString().trim() === "") {
           // Skip empty
           pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - Missing Device ID"]);
        }
        else {
            if (depReason) {
              AdminDirectory.Chromeosdevices.action({ "action": "deprovision", "deprovisionReason": depReason }, 'my_customer', deviceId);
              
              if (newOU) {
                AdminDirectory.Chromeosdevices.update({ orgUnitPath: newOU.toString() }, 'my_customer', deviceId);
                pendingLogs.push([new Date(), userEmail, serno, "Device deprovisioned" + ", " + depReason + " and moved to " + newOU]);
              } else {
                pendingLogs.push([new Date(), userEmail, serno, "Device deprovisioned" + ", " + depReason]);
              }
            } else {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - You forgot to select a deprovision reason"]);
            }
        }
      } catch (err) {
            var checkError = err.message;
            var alreadyDeprovisioned = "Illegal device state transition";
            var invalidInput = "Invalid Input"
            if (checkError.includes(alreadyDeprovisioned)) {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - Device already deprovisioned"]);
            }
            else if (checkError.includes(invalidInput)) {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - Serial missing"]);
            } else {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - " + err]);
            }
      }
    }

    flushLogs(logsheet, pendingLogs);

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processDeprovisionBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Deprovision complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    JobManager.updateJob(currentIndex, "Error: " + e.message, true, e.message);
    Logger.log(`Deprovision failed: ${e.toString()}\n${e.stack}`);
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