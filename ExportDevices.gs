/**
 * Entry point for the "Export Devices" menu item.
 * Resets any previous state and starts a fresh export.
 */
function exportCBs() {
  const config = getExportConfig();
  if (config.error) {
    SpreadsheetApp.getUi().alert(config.error);
    return;
  }
  
  JobManager.showJobSidebar(config);
}

function getExportConfig() {
  const sheetName = 'Devices';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return { error: `Sheet "${sheetName}" not found.` };
  }

  // Clear previous state to ensure fresh start
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('EXPORT_PAGE_TOKEN');
  props.deleteProperty('EXPORT_PROCESSED_COUNT');
  
  JobManager.clearJob();

  spreadsheet.toast('Exporting devices...', 'CB_Inventory');

  return {
    title: 'Export Devices',
    itemCount: 0, // Indeterminate
    startFunction: 'runExportJob'
  };
}

/**
 * Triggered start function
 */
function runExportJob() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName('Devices');
  
  JobManager.cleanupAllTriggers();
  
  // Setup Sheet for fresh data
  const lastRow = sheet.getMaxRows();
  sheet.getRange(1, 1, lastRow, 14).clearContent();

  const headers = [
    "Device ID", "Serial Number", "Org Unit Path", "Location", "AssetID", "User", "Notes",
    "Most Recent User", "OS Version", "Last Sync", "Status", "MAC", "AUE", "Model"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  SpreadsheetApp.flush();

  // Initialize Job
  JobManager.initJob('Export Devices', 0);

  // Start the initial burst IMMEDIATELY. 
  // Trigger will only be created IF this burst doesn't finish the whole job.
  processExportBatch(true);
}

/**
 * Worker function that performs the export.
 */
function processExportBatch(arg) {
  const isShortRun = (arg === true);
  const START_TIME = Date.now();
  const MAX_EXECUTION_TIME = 25 * 60 * 1000; 
  
  const sheetName = 'Devices';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet;
  try {
     sheet = spreadsheet.getSheetByName(sheetName);
  } catch (e) {
     JobManager.updateJob(0, "Error accessing sheet: " + e.message, true, e.message);
     JobManager.cleanupAllTriggers();
     return;
  }
  
  const props = PropertiesService.getScriptProperties();

  // Check Job Status
  let status = JobManager.getJobStatus();
  if (!status || status.isFinished || status.error) {
    JobManager.cleanupAllTriggers();
    return;
  }

  if (JobManager.isJobCancelled()) {
    JobManager.updateJob(status.processedCount, "Export cancelled by user.", true);
    JobManager.cleanupAllTriggers();
    return;
  }

  // Restore State
  let pageToken = props.getProperty('EXPORT_PAGE_TOKEN');
  let processedCount = parseInt(props.getProperty('EXPORT_PROCESSED_COUNT') || '0');
  
  const BATCH_SIZE = 2000; 
  let accumulatedRows = [];
  
  // Calculate start row directly from state
  let currentRow = processedCount + 2;

  try {
    do {
      // API Fetch with Retry
      let response;
      let attempts = 0;
      while (attempts < 5) {
        try {
          response = AdminDirectory.Chromeosdevices.list('my_customer', {
            maxResults: 200, 
            pageToken: pageToken,
            fields: 'nextPageToken,chromeosdevices(deviceId,serialNumber,orgUnitPath,annotatedLocation,annotatedAssetId,annotatedUser,notes,recentUsers(email),osVersion,lastSync,status,macAddress,autoUpdateExpiration,model)'
          });
          break;
        } catch (err) {
          attempts++;
          if (attempts >= 5) throw err;
          Utilities.sleep(Math.pow(attempts, 2) * 1000);
        }
      }

      // Check Cancellation IMMEDIATELY after API call
      if (JobManager.isJobCancelled()) {
        if (accumulatedRows.length > 0) writeBatch(sheet, accumulatedRows, currentRow);
        JobManager.updateJob(processedCount, "Export cancelled by user.", true);
        JobManager.cleanupAllTriggers();
        return;
      }

      const devices = response.chromeosdevices;
      if (devices && devices.length > 0) {
        const deviceRows = devices.map(d => [
          d.deviceId ?? "", d.serialNumber ?? "", d.orgUnitPath ?? "", d.annotatedLocation ?? "",
          d.annotatedAssetId ?? "", d.annotatedUser ?? "", d.notes ?? "",
          d.recentUsers?.[0]?.email ?? "", d.osVersion ?? "",
          d.lastSync ? new Date(d.lastSync) : "", d.status ?? "",
          d.macAddress ?? "", d.autoUpdateExpiration ?? "", d.model ?? ""
        ]);

        accumulatedRows = accumulatedRows.concat(deviceRows);
        processedCount += devices.length;

        // Write Batch
        if (accumulatedRows.length >= BATCH_SIZE) {
          writeBatch(sheet, accumulatedRows, currentRow);
          currentRow += accumulatedRows.length;
          accumulatedRows = [];
          
          if (response.nextPageToken) {
            props.setProperty('EXPORT_PAGE_TOKEN', response.nextPageToken);
            props.setProperty('EXPORT_PROCESSED_COUNT', processedCount.toString());
          }
          
          // Update Status with Processed Count so it shows in Sidebar
          const msg = `Exporting devices... (Processed: ${processedCount})`;
          JobManager.updateJob(processedCount, msg);
          
          // Progress flush
          SpreadsheetApp.flush();
        }
      }

      pageToken = response.nextPageToken;
      
      // Time Check / Run Limit
      if (isShortRun) {
         if (processedCount >= 2000) break; // Return control to UI after first batch
      } else if (Date.now() - START_TIME > MAX_EXECUTION_TIME) {
         break; // Trigger timeout reached
      }

    } while (pageToken);

    // Final Write for this cycle
    if (accumulatedRows.length > 0) {
      writeBatch(sheet, accumulatedRows, currentRow);
      currentRow += accumulatedRows.length;
    }

    if (pageToken) {
        // Not done yet. Save state and create trigger if needed.
        props.setProperty('EXPORT_PAGE_TOKEN', pageToken);
        props.setProperty('EXPORT_PROCESSED_COUNT', processedCount.toString());
        
        JobManager.updateJob(processedCount, `Exporting devices... (Processed: ${processedCount})`);
        
        // Ensure exactly ONE trigger exists for the next batch
        JobManager.cleanupAllTriggers();
        ScriptApp.newTrigger('processExportBatch')
          .timeBased()
          .after(30 * 1000)
          .create();
          
        return; 
    }

    // Completely Finished
    if (!pageToken) {
        removeDuplicates(sheet);

        if (sheet.getLastRow() > 1) {
          try {
            JobManager.updateJob(processedCount, "Sorting devices...");
            const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14);
            dataRange.sort({column: 3, ascending: true});
          } catch (sortError) {
            console.warn('Sorting failed: ' + sortError.message);
          }
        }

        props.deleteProperty('EXPORT_PAGE_TOKEN');
        props.deleteProperty('EXPORT_PROCESSED_COUNT');
        
        JobManager.updateJob(processedCount, "Export Complete!", true);
        JobManager.cleanupAllTriggers();
    }

  } catch (e) {
    Logger.log(`Export Error: ${e.message}`);
    const savedToken = props.getProperty('EXPORT_PAGE_TOKEN');
    if (savedToken) {
       JobManager.updateJob(processedCount, "Error: " + e.message + ". Retrying...", false);
       JobManager.cleanupAllTriggers();
       ScriptApp.newTrigger('processExportBatch').timeBased().after(30 * 1000).create();
    } else {
       JobManager.updateJob(processedCount, "Export failed: " + e.message, true, e.message);
       JobManager.cleanupAllTriggers();
    }
  }
}

function writeBatch(sheet, rows, startRow) {
  let writeAttempts = 0;
  const maxWriteAttempts = 5;
  while (writeAttempts < maxWriteAttempts) {
    try {
      SpreadsheetApp.flush();
      sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
      SpreadsheetApp.flush();
      break;
    } catch (e) {
      writeAttempts++;
      if (writeAttempts >= maxWriteAttempts) throw e;
      Utilities.sleep(Math.pow(writeAttempts, 2) * 5000); 
    }
  }
}

function deleteExportTriggers() {
   JobManager.cleanupAllTriggers();
}

function removeDuplicates(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  try {
    sheet.getRange(2, 1, lastRow - 1, 14).removeDuplicates([1]); 
  } catch (e) {
    console.warn("Native removeDuplicates failed: " + e.message);
  }
}