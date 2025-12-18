// The maximum runtime for a single execution in milliseconds. (25 minutes)
const FIND_UNLOCATED_MAX_RUNTIME_MS = 25 * 60 * 1000;

function findUnlocatedDevices() {
  const config = getFindUnlocatedDevicesConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getFindUnlocatedDevicesConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const devicesSheet = ss.getSheetByName("Devices");
  const dislocatedSheet = ss.getSheetByName("Dislocated");

  if (!devicesSheet) {
    return { error: "Sheet 'Devices' not found." };
  }
  if (!dislocatedSheet) {
    return { error: "Sheet 'Dislocated' not found. Please create it." };
  }

  // We can't easily know total unlocated count without scanning, 
  // so we'll just show "Processing..." with unknown total or use total devices as proxy.
  // Using total devices (rows) as a rough progress indicator.
  const totalCount = devicesSheet.getLastRow() - 1;

  JobManager.clearJob();

  return {
    title: 'Find Unlocated Devices',
    itemCount: totalCount,
    startFunction: 'runFindUnlocatedDevicesJob'
  };
}

function runFindUnlocatedDevicesJob() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const devicesSheet = ss.getSheetByName("Devices");
  const dislocatedSheet = ss.getSheetByName("Dislocated");

  JobManager.cleanupAllTriggers();

  // Clear 'Dislocated' sheet starting from row 2 before starting
  const lastRow = dislocatedSheet.getLastRow();
  if (lastRow > 1) {
    dislocatedSheet.getRange(2, 1, lastRow - 1, 8).clearContent();
  }

  const totalCount = devicesSheet.getLastRow() - 1;
  JobManager.initJob('Find Unlocated Devices', totalCount);

  processFindUnlocatedDevicesBatch(true);
}

function processFindUnlocatedDevicesBatch(arg) {
  const isShortRun = (arg === true);
  const startTime = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let devicesSheet, dislocatedSheet;
  try {
    devicesSheet = ss.getSheetByName("Devices");
    dislocatedSheet = ss.getSheetByName("Dislocated");
  } catch (e) {
    console.error("Failed to access sheets: " + e.message);
    JobManager.updateJob(0, "Error accessing sheets: " + e.message, true, e.message);
    JobManager.cleanupAllTriggers();
    return;
  }

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
  
  // Optimization: Read in chunks if possible, but reading whole sheet is usually okay for <100k rows
  // To stick to batch pattern and avoid memory issues, let's read in chunks.
  const BATCH_SIZE = 5000;
  const totalRows = devicesSheet.getLastRow() - 1;
  
  // Calculate start row (index 0 is header in sheet, so data starts at row 2)
  // currentIndex is number of *processed* rows.
  // Row index in sheet = currentIndex + 2.
  
  let output = [];
  
  try {
    // Process loop
    while (currentIndex < totalRows) {
      if (JobManager.isJobCancelled()) {
        JobManager.updateJob(currentIndex, "Cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }
      
      // Determine chunk size
      let rowsToRead = Math.min(BATCH_SIZE, totalRows - currentIndex);
      let startRow = currentIndex + 2;
      
      // Read chunk
      let data = devicesSheet.getRange(startRow, 1, rowsToRead, 8).getValues();
      
      for (var i = 0; i < data.length; i++) {
        let row = data[i];
        let orgUnitPath = row[2];
        let mostRecentUser = row[7];
        
        if (orgUnitPath === "/") {
          if (isValidEmail_(mostRecentUser)) {
            output.push(row);
          }
        } else {
           // We hit a non-root OU. Assuming sorted, we are done.
           // Write what we have and finish.
           if (output.length > 0) {
             appendData(dislocatedSheet, output);
           }
           JobManager.updateJob(totalRows, "Found unlocated devices.", true); // Mark 100%
           JobManager.cleanupAllTriggers();
           return; 
        }
      }
      
      currentIndex += rowsToRead;
      
      // Update status
      JobManager.updateJob(currentIndex, "Scanning devices...");
      
      // Write intermediate results
      if (output.length > 0) {
        appendData(dislocatedSheet, output);
        output = [];
      }
      
      // SHORT RUN CHECK / TIMEOUT CHECK
      if (isShortRun || Date.now() - startTime > FIND_UNLOCATED_MAX_RUNTIME_MS) {
         break;
      }
    }
    
    if (currentIndex < totalRows) {
        // Not done yet. Reschedule.
        JobManager.updateJob(currentIndex, "Rescheduling scan...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processFindUnlocatedDevicesBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        // Finished all rows
        JobManager.updateJob(totalRows, "Scan complete.", true);
        JobManager.cleanupAllTriggers();
    }
    
  } catch (e) {
    JobManager.updateJob(currentIndex, "Error: " + e.message, true, e.message);
    JobManager.cleanupAllTriggers();
  }
}

function appendData(sheet, rows) {
  if (rows.length > 0) {
    const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
    SpreadsheetApp.flush();
  }
}

function isValidEmail_(email) {
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}