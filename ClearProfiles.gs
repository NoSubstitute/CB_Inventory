function clearProfiles() {
  // Display a dialog box with a message and "Yes" and "No" buttons. The user can also close the
  // dialog by clicking the close button in its title bar.
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('Confirmation: Clear Profiles','Do you really want to clear these devices?', ui.ButtonSet.YES_NO);

  // Process the user's response.
  if (response == ui.Button.YES) {
    Logger.log('Ok, clearing devices');

  // Get User/Operator Info
  var userEmail = Session.getActiveUser().getEmail()
  // Get the current spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Set the sheet called UpdateCBs as the sheet we're working in
  var sheet = SpreadsheetApp.setActiveSheet(ss.getSheetByName("UpdateCBs"));
  // Log actions to the sheet called Log
  var logsheet = SpreadsheetApp.setActiveSheet(ss.getSheetByName("Log"));
  // Get all data from the second row to the last row with data, and the last column with data
  var lastrow = sheet.getLastRow();
  var lastcolumn = sheet.getLastColumn();
  var range = sheet.getRange(2,1,lastrow-1,lastcolumn);
  var list = range.getValues();
    for (var i=0; i<list.length; i++) {
      // Grab serial number from the first column (0) 
      var serno = list[i][0];
      // Since we provided serial numbers, convert each to device-id
      var sernoquery = "id:"+serno;
      // Use AdminSDK API to check if the cros device exists. Else the update will fail
      var chromebooklist = AdminDirectory.Chromeosdevices.list('my_customer', {query: sernoquery}).chromeosdevices;
        if (!chromebooklist) {
          logsheet.appendRow([serno, "not found"]);
        } else if (chromebooklist.length !== 1) {
          logsheet.appendRow([serno, chromebooklist.length+" found"]);
        } else {
          var id = chromebooklist[0].deviceId;
          // For each line, try to update the device with given data, and log the result
            try {
              AdminDirectory.Customer.Devices.Chromeos.issueCommand({"commandType": "WIPE_USERS"},'my_customer',id);
              logsheet.appendRow([new Date(), userEmail, serno, "Device profiles cleared"]);

              // If the update fails for some reason, log the error
            } catch (err) {
              logsheet.appendRow([serno, err]);
            }
        }
    }
  } else {
    Logger.log('The user clicked "No" or the close button in the dialog\'s title bar.');
  }
}
/**
Last edit: 20220201-1806 Removed unnecessary log lines
*/
