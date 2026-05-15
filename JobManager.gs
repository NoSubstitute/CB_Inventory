// Shared Job Manager for handling long-running background processes with UI feedback

var JobManager = {
  GLOBAL_JOB_KEY: 'CB_INVENTORY_CURRENT_JOB',

  /**
   * Opens the generic Sidebar UI.
   * @param {object} config Configuration object for the sidebar.
   * @param {string} config.title Title to display (e.g., "Update Devices").
   * @param {string} [config.jobType] Type of job to start (e.g., 'UPDATE', 'MOVE').
   * @param {number} [config.itemCount] Number of items to process (for confirmation).
   */
  showJobSidebar: function(config) {
    try {
      console.log("JobManager: showJobSidebar called", config);
      const template = HtmlService.createTemplateFromFile('Sidebar');
      
      // Pass configuration to the template
      if (config) {
        template.config = JSON.stringify(config);
      } else {
        template.config = JSON.stringify({});
      }

      const html = template.evaluate()
          .setTitle('CB_Inventory')
          .setWidth(300); 
      
      SpreadsheetApp.flush(); // Ensure state is clean before UI render
      Utilities.sleep(500); // Slight delay to ensure UI service is ready
      SpreadsheetApp.getUi().showSidebar(html);
      console.log("JobManager: Sidebar displayed");
    } catch (e) {
      console.error("JobManager: Failed to show sidebar: " + e.message);
      SpreadsheetApp.getUi().alert("Failed to open sidebar: " + e.message);
    }
  },

  /**
   * Initializes a new job state.
   * @param {string} title - The display title for the job.
   * @param {number} totalCount - Total items to process.
   * @return {object} The initial status object.
   */
  initJob: function(title, totalCount) {
    const lock = LockService.getScriptLock();
    try {
      if (!lock.tryLock(5000)) {
         throw new Error("Could not acquire lock to initialize job.");
      }
      const status = {
        title: title,
        isActive: true,
        isFinished: false,
        error: null,
        processedCount: 0,
        totalCount: totalCount,
        message: 'Initializing...',
        startTime: Date.now(),
        lastUpdated: Date.now(),
        cancelRequested: false
      };
      PropertiesService.getScriptProperties().setProperty(this.GLOBAL_JOB_KEY, JSON.stringify(status));
      return status;
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }
  },

  /**
   * Updates the current job status.
   * @param {number} processed - Number of items processed so far.
   * @param {string} message - Current activity description.
   * @param {boolean} [finished] - (Optional) Mark job as finished.
   * @param {string} [error] - (Optional) Error message if failed.
   */
  updateJob: function(processed, message, finished, error) {
    const lock = LockService.getScriptLock();
    try {
      if (!lock.tryLock(5000)) {
         console.warn("JobManager: Could not acquire lock to update job. Skipping update.");
         return;
      }
      const prop = PropertiesService.getScriptProperties().getProperty(this.GLOBAL_JOB_KEY);
      if (!prop) return; // No active job
      
      let status = JSON.parse(prop);
      
      // Preserve cancelRequested if it was set by another process
      const wasCancelled = status.cancelRequested;
      
      status.processedCount = processed;
      
      // Update message if not cancelled OR if this is a terminal state (finished/error)
      if (!wasCancelled || finished || error) {
        status.message = message;
      }
      
      status.lastUpdated = Date.now();
      
      // Ensure we don't clear the cancelRequested flag if it was set
      if (wasCancelled) status.cancelRequested = true;
      
      if (finished !== undefined) status.isFinished = finished;
      if (finished) status.isActive = false;
      if (error) {
        status.error = error;
        status.isActive = false;
        status.isFinished = true;
      }
      
      PropertiesService.getScriptProperties().setProperty(this.GLOBAL_JOB_KEY, JSON.stringify(status));
    } catch (e) {
      console.error("Failed to updateJob: " + e.message);
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }
  },

  /**
   * Checks if the current job has been cancelled by the user.
   * @return {boolean} True if cancelled.
   */
  isJobCancelled: function() {
    // No lock needed for simple read
    const prop = PropertiesService.getScriptProperties().getProperty(this.GLOBAL_JOB_KEY);
    if (!prop) return false;
    return JSON.parse(prop).cancelRequested === true;
  },

  /**
   * Called by client-side polling to get current status.
   * @return {object|null} The job status object.
   */
  getJobStatus: function() {
    // No lock needed for simple read
    const prop = PropertiesService.getScriptProperties().getProperty(this.GLOBAL_JOB_KEY);
    if (!prop) return null;
    return JSON.parse(prop);
  },

  /**
   * Called by client-side to request cancellation.
   */
  cancelJob: function() {
    const lock = LockService.getScriptLock();
    try {
      if (!lock.tryLock(5000)) {
         console.warn("JobManager: Could not acquire lock to cancel job.");
         return;
      }
      const prop = PropertiesService.getScriptProperties().getProperty(this.GLOBAL_JOB_KEY);
      if (!prop) return;
      
      let status = JSON.parse(prop);
      status.cancelRequested = true;
      status.message = "Cancellation requested...";
      status.lastUpdated = Date.now();
      PropertiesService.getScriptProperties().setProperty(this.GLOBAL_JOB_KEY, JSON.stringify(status));
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }
  },

  /**
   * Clears the job status.
   */
  clearJob: function() {
    // No lock needed for clearJob. Just force delete the property to reset state.
    // This avoids deadlocks if a previous job crashed while holding a lock.
    PropertiesService.getScriptProperties().deleteProperty(this.GLOBAL_JOB_KEY);
  },

  /**
   * Finds the last row with actual non-empty content in a given column.
   * Useful when Sheet.getLastRow() is unreliable due to hidden/empty strings.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet to search.
   * @param {number} column The 1-indexed column number to check for content.
   * @returns {number} The 1-indexed row number of the last populated cell, or 1 if only headers are present or entirely empty.
   */
  _findLastPopulatedRow: function(sheet, column) {
    const lastRow = sheet.getLastRow();
    if (lastRow === 0) return 1;
    
    // Get all values in the column at once
    const values = sheet.getRange(1, column, lastRow, 1).getValues();
    
    // Check from bottom up in memory
    for (let i = values.length - 1; i >= 0; i--) {
      const val = values[i][0];
      if (val !== "" && val !== null && typeof val !== 'undefined') {
        return i + 1;
      }
    }
    return 1;
  },

  /**
   * Cleans up all triggers associated with batch processing functions in the project.
   * This prevents "Too many triggers" errors when switching between different jobs.
   */
  cleanupAllTriggers: function() {
    const triggers = ScriptApp.getProjectTriggers();
    const knownHandlers = [
      'processUpdateBatch',
      'processEnableBatch',
      'processDisableBatch',
      'processClearProfilesBatch',
      'processPowerWashBatch',
      'processDeprovisionBatch',
      'processDeprovisionBySerialBatch',
      'processDeprovisionByAssetIdBatch',
      'processMoveBatch',
      'processFindUserOUsBatch',
      'processExportBatch',
      'processFindUnlocatedDevicesBatch'
    ];
    
    for (const trigger of triggers) {
      if (knownHandlers.includes(trigger.getHandlerFunction())) {
        ScriptApp.deleteTrigger(trigger);
      }
    }
  }
};

/**
 * Global wrapper functions to expose JobManager methods to client-side google.script.run
 * Client-side cannot call JobManager.method() directly, only top-level functions.
 */
function getJobStatus() {
  return JobManager.getJobStatus();
}

function cancelJob() {
  return JobManager.cancelJob();
}

function clearJob() {
  return JobManager.clearJob();
}