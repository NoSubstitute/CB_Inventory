// The maximum runtime for a single execution in milliseconds. (25 minutes)
const FIND_OU_MAX_RUNTIME_MS = 25 * 60 * 1000;

// =========================================================================================
// == Main function called by the user to start the process
// =========================================================================================
function findUserOUs() {
  const config = getFindUserOUsConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getFindUserOUsConfig() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("Dislocated");
    
    if (!sheet) {
      return { error: 'Sheet "Dislocated" not found.' };
    }

    const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
    if (lastRow < 2) {
      return { error: 'No devices listed in "Dislocated" sheet.' };
    }

    const totalCount = lastRow - 1;

    JobManager.clearJob();
    
    return {
      title: 'Find User OUs',
      itemCount: totalCount,
      startFunction: 'runFindUserOUsJob'
    };
  } catch (e) {
    return { error: "Error starting Find User OUs: " + e.message + "\n" + e.stack };
  }
}

// =========================================================================================
// == Triggered start function
// =========================================================================================
function runFindUserOUsJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("Dislocated");
  
  JobManager.cleanupAllTriggers();
  
  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  const totalCount = lastRow - 1;

  JobManager.initJob('Find User OUs', totalCount);
  
  processFindUserOUsBatch(true);
}

// =========================================================================================
// == Core processing function
// =========================================================================================
function processFindUserOUsBatch(arg) {
  const isShortRun = (arg === true);
  const startTime = Date.now();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  let dislocatedSheet, locatedSheet, logsheet;
  try {
    dislocatedSheet = spreadsheet.getSheetByName("Dislocated");
    locatedSheet = spreadsheet.getSheetByName("Located");
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

  const lastRow = JobManager._findLastPopulatedRow(dislocatedSheet, 1);
  if (lastRow < 2) {
    JobManager.updateJob(0, "No data found.", true);
    JobManager.cleanupAllTriggers();
    return;
  }

  // Load list from Dislocated sheet
  const deviceList = dislocatedSheet.getRange(2, 1, lastRow - 1, 8).getValues();
  
  let collectedLocatedData = [];
  let pendingLogs = [];
  let i = currentIndex;

  try {
    for (; i < deviceList.length; i++) {
      if (JobManager.isJobCancelled()) {
        flushLogs(logsheet, pendingLogs);
        if (collectedLocatedData.length > 0) {
          const startRow = JobManager._findLastPopulatedRow(locatedSheet, 1) + 1;
          locatedSheet.getRange(startRow, 1, collectedLocatedData.length, collectedLocatedData[0].length).setValues(collectedLocatedData);
        }
        pendingLogs = [];
        collectedLocatedData = [];
        JobManager.updateJob(i, "Cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      if (i > currentIndex && i % 50 === 0) {
        JobManager.updateJob(i, "Finding User OUs...");
        flushLogs(logsheet, pendingLogs);
        if (collectedLocatedData.length > 0) {
          const startRow = JobManager._findLastPopulatedRow(locatedSheet, 1) + 1;
          locatedSheet.getRange(startRow, 1, collectedLocatedData.length, collectedLocatedData[0].length).setValues(collectedLocatedData);
        }
        pendingLogs = [];
        collectedLocatedData = [];
      }
      
      if (isShortRun && i >= currentIndex + 50) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > FIND_OU_MAX_RUNTIME_MS) {
         break;
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      
      if (!deviceId || deviceId.toString().trim() === "") {
        continue;
      }

      let serno = rowData[1];
      let location = rowData[3].toString();
      let note = rowData[6].toString();
      let userInfo = rowData[7]; 
      
      try {              
        if (!userInfo || userInfo.toString().trim() === "" || !isValidEmail_(userInfo)) {
           collectedLocatedData.push([deviceId, serno, "Error: Invalid User Email", "", "", "", ""]); 
           pendingLogs.push([new Date(), userEmail, serno, `FAILED FIND OU - Invalid or missing user email: ${userInfo}`]);
        } else {
            let userData = AdminDirectory.Users.get(userInfo);
            let userOU = userData.orgUnitPath;
            let asset = userData.name.fullName; 
            
            collectedLocatedData.push([deviceId, serno, userOU, location, asset, userInfo, note]); 
            pendingLogs.push([new Date(), userEmail, serno, `Located User OU: ${userOU}`]);
        }
      } catch (err) {
          collectedLocatedData.push([deviceId, serno, "Error: " + err.message, "", "", "", ""]); 
          pendingLogs.push([new Date(), userEmail, serno, `FAILED FIND OU - ${err.message}`]);
      }
    }

    flushLogs(logsheet, pendingLogs);
    if (collectedLocatedData.length > 0) {
      const startRow = JobManager._findLastPopulatedRow(locatedSheet, 1) + 1;
      locatedSheet.getRange(startRow, 1, collectedLocatedData.length, collectedLocatedData[0].length).setValues(collectedLocatedData);
    }
    pendingLogs = [];
    collectedLocatedData = [];

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processFindUserOUsBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Find User OUs complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    if (collectedLocatedData.length > 0) {
      const startRow = JobManager._findLastPopulatedRow(locatedSheet, 1) + 1;
      locatedSheet.getRange(startRow, 1, collectedLocatedData.length, collectedLocatedData[0].length).setValues(collectedLocatedData);
    }
    pendingLogs = [];
    collectedLocatedData = [];
    JobManager.updateJob(currentIndex, "An unexpected error occurred: " + e.message, true, e.message);
    Logger.log(`Find User OUs failed: ${e.toString()}\n${e.stack}`);
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

function isValidEmail_(email) {
  var emailRegex = /^[^S@]+@[^S@]+\.[^S@]+$/;
  return emailRegex.test(email);
}