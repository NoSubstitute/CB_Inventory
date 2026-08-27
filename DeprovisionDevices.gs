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
  
  if (!sheet) {
    return { error: 'Sheet "DeprovisionCBs" not found.' };
  }

  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  if (lastRow < 2) {
    return { error: 'No devices listed in "DeprovisionCBs" sheet.' };
  }

  const totalCount = lastRow - 1;

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
  
  const lastRow = JobManager._findLastPopulatedRow(sheet, 1);
  const totalCount = lastRow - 1;

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

  // Load list. Cols: A(0)=ID, B(1)=Serial, C(2)=AssetID, D(3)=NewOU, E(4)=Reason
  // Get 5 columns
  const deviceList = sheet.getRange(2, 1, JobManager._findLastPopulatedRow(sheet, 1) - 1, 5).getValues();

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
      let newOU = rowData[3];
      let depReason = rowData[4];
      
      try {
        if (!deviceId || deviceId.toString().trim() === "") {
           pendingLogs.push([new Date(), userEmail, "", "FAILED DEPROVISON - Missing Device ID"]);
           continue; // Skip the rest of the processing for this row
        }
        else {
            if (depReason) {
              AdminDirectory.Chromeosdevices.action({ "action": "deprovision", "deprovisionReason": depReason }, 'my_customer', deviceId);
              
              if (newOU) {
                AdminDirectory.Chromeosdevices.update({ orgUnitPath: newOU.toString() }, 'my_customer', deviceId);
                pendingLogs.push([new Date(), userEmail, deviceId, "Device deprovisioned" + ", " + depReason + " and moved to " + newOU]);
              } else {
                pendingLogs.push([new Date(), userEmail, deviceId, "Device deprovisioned" + ", " + depReason]);
              }
            } else {
              pendingLogs.push([new Date(), userEmail, deviceId, "FAILED DEPROVISON - You forgot to select a deprovision reason"]);
            }
        }
      } catch (err) {
            const checkError = err.message;
            const alreadyDeprovisioned = "Illegal device state transition";
            const invalidInput = "Invalid Input"
            if (checkError.includes(alreadyDeprovisioned)) {
              pendingLogs.push([new Date(), userEmail, deviceId, "FAILED DEPROVISON - Device already deprovisioned"]);
            }
            else if (checkError.includes(invalidInput)) {
              pendingLogs.push([new Date(), userEmail, deviceId, "FAILED DEPROVISON - Device ID invalid"]);
            } else {
              pendingLogs.push([new Date(), userEmail, deviceId, "FAILED DEPROVISON - " + err]);
            }
      }
    }

    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];

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
    pendingLogs = [];
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

// =========================================================================================
// == Deprovision by Serial Number (Alternative Flow)
// =========================================================================================
/**
 * Initiates the deprovisioning process by serial number.
 */
function deprovisionChromebookBySerial() {
  const config = getDeprovisionBySerialConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

/**
 * Generates the configuration for the deprovision by serial job.
 * @return {object} The configuration object.
 */
function getDeprovisionBySerialConfig() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("DeprovisionCBs");
  
  if (!sheet) {
    return { error: 'Sheet "DeprovisionCBs" not found.' };
  }

  const lastRow = JobManager._findLastPopulatedRow(sheet, 2);
  if (lastRow < 2) {
    return { error: 'No devices listed in "DeprovisionCBs" sheet.' };
  }

  const totalCount = lastRow - 1;

  // Force cold start
  JobManager.clearJob();
  
  return {
    title: 'Deprovision by Serial (slow)',
    itemCount: totalCount,
    startFunction: 'runDeprovisionBySerialJob'
  };
}

/**
 * Triggered function to start the deprovision by serial job.
 */
function runDeprovisionBySerialJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("DeprovisionCBs");
  
  JobManager.cleanupAllTriggers();
  
  const lastRow = JobManager._findLastPopulatedRow(sheet, 2);
  const totalCount = lastRow - 1;

  JobManager.initJob('Deprovision by Serial (slow)', totalCount);
  
  processDeprovisionBySerialBatch(true);
}

/**
 * Core processing function for deprovisioning by serial in batches.
 * @param {boolean} arg If true, runs a short batch (UI preview).
 */
function processDeprovisionBySerialBatch(arg) {
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

  // Load list. Cols: A(0)=ID, B(1)=Serial, C(2)=AssetID, D(3)=NewOU, E(4)=Reason
  // Get 5 columns
  const deviceList = sheet.getRange(2, 1, JobManager._findLastPopulatedRow(sheet, 2) - 1, 5).getValues();

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
      
      if (i % 10 === 0) {
        JobManager.updateJob(i, "Processing serial numbers...");
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
      }
      
      if (isShortRun && i >= currentIndex + 20) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > DEPROV_MAX_RUNTIME_MS) {
         break;
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      let serno = rowData[1];
      let newOU = rowData[3];
      let depReason = rowData[4];
      
      try {
        if (!serno || serno.toString().trim() === "") {
           pendingLogs.push([new Date(), userEmail, "", "FAILED DEPROVISON - Missing Serial Number"]);
           continue; // Skip processing if the primary identifier for this flow is missing
        }

        // Alternative Flow: Lookup if Device ID is missing
        if (!deviceId || deviceId.toString().trim() === "") {
           deviceId = getDeviceIdBySerialNumber(serno.toString().trim());
        }

        if (!deviceId || deviceId.toString().trim() === "") {
           pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - Serial lookup failed (Device ID not found)"]);
        }
        else {
            if (depReason) {
              AdminDirectory.Chromeosdevices.action({ "action": "deprovision", "deprovisionReason": depReason }, 'my_customer', deviceId);
              
              if (newOU) {
                AdminDirectory.Chromeosdevices.update({ orgUnitPath: newOU.toString() }, 'my_customer', deviceId);
                pendingLogs.push([new Date(), userEmail, serno, "Device deprovisioned (via serial)" + ", " + depReason + " and moved to " + newOU]);
              } else {
                pendingLogs.push([new Date(), userEmail, serno, "Device deprovisioned (via serial)" + ", " + depReason]);
              }
            } else {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - You forgot to select a deprovision reason"]);
            }
        }
      } catch (err) {
            const checkError = err.message;
            const alreadyDeprovisioned = "Illegal device state transition";
            const invalidInput = "Invalid Input"
            if (checkError.includes(alreadyDeprovisioned)) {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - Device already deprovisioned"]);
            }
            else if (checkError.includes(invalidInput)) {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - Serial missing or invalid"]);
            } else {
              pendingLogs.push([new Date(), userEmail, serno, "FAILED DEPROVISON - " + err]);
            }
      }
    }

    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processDeprovisionBySerialBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Deprovision complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];
    JobManager.updateJob(currentIndex, "Error: " + e.message, true, e.message);
    Logger.log(`Deprovision by serial failed: ${e.toString()}\n${e.stack}`);
    JobManager.cleanupAllTriggers();
  }
}

/**
 * Looks up the device ID for a given serial number using the Admin Directory API.
 * @param {string} serialNumber The serial number to look up.
 * @return {string|null} The device ID if found, otherwise null.
 */
function getDeviceIdBySerialNumber(serialNumber) {
  if (!serialNumber) return null;
  const normalizedSerial = serialNumber.toString().trim().toUpperCase();
  if (!normalizedSerial) return null;
  
  try {
    const response = AdminDirectory.Chromeosdevices.list('my_customer', {
      query: `id:${normalizedSerial}`,
      projection: 'BASIC'
    });
    
    if (response.chromeosdevices && response.chromeosdevices.length > 0) {
      // The API query might return partial matches, so we must verify exact match
      for (const device of response.chromeosdevices) {
        if (device.serialNumber && device.serialNumber.toUpperCase() === normalizedSerial) {
          return device.deviceId;
        }
      }
    }
  } catch (e) {
    console.error(`Error looking up serial number ${normalizedSerial}: ${e.message}`);
  }
  
  return null;
}

/**
 * Looks up the device ID for a given Asset ID using the Admin Directory API.
 * @param {string} assetId The Asset ID to look up.
 * @return {string|null} The device ID if found, otherwise null.
 */
function getDeviceIdByAssetId(assetId) {
  if (!assetId) return null;
  const normalizedAssetId = assetId.toString().trim();
  if (!normalizedAssetId) return null;
  
  try {
    const response = AdminDirectory.Chromeosdevices.list('my_customer', {
      query: `asset_id:${normalizedAssetId}`,
      projection: 'FULL'
    });
    
    if (response.chromeosdevices && response.chromeosdevices.length > 0) {
      // The API query might return partial matches, so we must verify exact match
      for (const device of response.chromeosdevices) {
        if (device.annotatedAssetId === normalizedAssetId) {
          return device.deviceId;
        }
      }
    }
  } catch (e) {
    console.error(`Error looking up Asset ID ${normalizedAssetId}: ${e.message}`);
  }
  
  return null;
}

// =========================================================================================
// == Deprovision by Asset ID (Alternative Flow)
// =========================================================================================
/**
 * Initiates the deprovisioning process by Asset ID.
 */
function deprovisionChromebookByAssetId() {
  const config = getDeprovisionByAssetIdConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

/**
 * Generates the configuration for the deprovision by Asset ID job.
 * @return {object} The configuration object.
 */
function getDeprovisionByAssetIdConfig() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("DeprovisionCBs");
  
  if (!sheet) {
    return { error: 'Sheet "DeprovisionCBs" not found.' };
  }

  const lastRow = JobManager._findLastPopulatedRow(sheet, 3);
  if (lastRow < 2) {
    return { error: 'No devices listed in "DeprovisionCBs" sheet.' };
  }

  const totalCount = lastRow - 1;

  // Force cold start
  JobManager.clearJob();
  
  return {
    title: 'Deprovision by Asset ID (slow)',
    itemCount: totalCount,
    startFunction: 'runDeprovisionByAssetIdJob'
  };
}

/**
 * Triggered function to start the deprovision by Asset ID job.
 */
function runDeprovisionByAssetIdJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("DeprovisionCBs");
  
  JobManager.cleanupAllTriggers();
  
  const lastRow = JobManager._findLastPopulatedRow(sheet, 3);
  const totalCount = lastRow - 1;

  JobManager.initJob('Deprovision by Asset ID (slow)', totalCount);
  
  processDeprovisionByAssetIdBatch(true);
}

/**
 * Core processing function for deprovisioning by Asset ID in batches.
 * @param {boolean} arg If true, runs a short batch (UI preview).
 */
function processDeprovisionByAssetIdBatch(arg) {
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

  // Load list. Cols: A(0)=ID, B(1)=Serial, C(2)=AssetID, D(3)=NewOU, E(4)=Reason
  const deviceList = sheet.getRange(2, 1, JobManager._findLastPopulatedRow(sheet, 3) - 1, 5).getValues();

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
      
      if (i % 10 === 0) {
        JobManager.updateJob(i, "Processing Asset IDs...");
        flushLogs(logsheet, pendingLogs);
        pendingLogs = [];
      }
      
      if (isShortRun && i >= currentIndex + 20) {
         break; 
      } else if (!isShortRun && Date.now() - startTime > DEPROV_MAX_RUNTIME_MS) {
         break;
      }
      
      let rowData = deviceList[i];
      let deviceId = rowData[0];
      let assetid = rowData[2];
      let newOU = rowData[3];
      let depReason = rowData[4];
      
      try {
        if (!assetid || assetid.toString().trim() === "") {
           pendingLogs.push([new Date(), userEmail, "", "FAILED DEPROVISON - Missing Asset ID"]);
           continue; // Skip processing if the primary identifier for this flow is missing
        }

        // Alternative Flow: Lookup if Device ID is missing
        if (!deviceId || deviceId.toString().trim() === "") {
           deviceId = getDeviceIdByAssetId(assetid.toString().trim());
        }

        if (!deviceId || deviceId.toString().trim() === "") {
           pendingLogs.push([new Date(), userEmail, assetid, "FAILED DEPROVISON - Asset ID lookup failed (Device ID not found)"]);
        }
        else {
            if (depReason) {
              AdminDirectory.Chromeosdevices.action({ "action": "deprovision", "deprovisionReason": depReason }, 'my_customer', deviceId);
              
              if (newOU) {
                AdminDirectory.Chromeosdevices.update({ orgUnitPath: newOU.toString() }, 'my_customer', deviceId);
                pendingLogs.push([new Date(), userEmail, assetid, "Device deprovisioned (via Asset ID)" + ", " + depReason + " and moved to " + newOU]);
              } else {
                pendingLogs.push([new Date(), userEmail, assetid, "Device deprovisioned (via Asset ID)" + ", " + depReason]);
              }
            } else {
              pendingLogs.push([new Date(), userEmail, assetid, "FAILED DEPROVISON - You forgot to select a deprovision reason"]);
            }
        }
      } catch (err) {
            const checkError = err.message;
            const alreadyDeprovisioned = "Illegal device state transition";
            const invalidInput = "Invalid Input"
            if (checkError.includes(alreadyDeprovisioned)) {
              pendingLogs.push([new Date(), userEmail, assetid, "FAILED DEPROVISON - Device already deprovisioned"]);
            }
            else if (checkError.includes(invalidInput)) {
              pendingLogs.push([new Date(), userEmail, assetid, "FAILED DEPROVISON - Asset ID missing or invalid"]);
            } else {
              pendingLogs.push([new Date(), userEmail, assetid, "FAILED DEPROVISON - " + err]);
            }
      }
    }

    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];

    if (i < deviceList.length) {
        JobManager.updateJob(i, "Rescheduling process...", false);
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processDeprovisionByAssetIdBatch')
          .timeBased()
          .after(10 * 1000)
          .create();
    } else {
        JobManager.updateJob(deviceList.length, "Deprovision complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    flushLogs(logsheet, pendingLogs);
    pendingLogs = [];
    JobManager.updateJob(currentIndex, "Error: " + e.message, true, e.message);
    Logger.log(`Deprovision by Asset ID failed: ${e.toString()}\n${e.stack}`);
    JobManager.cleanupAllTriggers();
  }
}