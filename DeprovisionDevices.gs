function deprovisionChromebook() {
  // Display a dialog box with a message and "Yes" and "No" buttons. The user can also close the
  // dialog by clicking the close button in its title bar.
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('Confirmation: Deprovision Devices', 'Do you really want to deprovison these devices?', ui.ButtonSet.YES_NO);
  // Process the user's response.
  if (response == ui.Button.YES) {
    // Logger.log('Ok, running the deprovision');
    // Get User/Operator Info
    var userEmail = Session.getActiveUser().getEmail()
    // Get the current spreadsheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Set the sheet called Deprovision as the sheet we're working in
    var sheet = SpreadsheetApp.setActiveSheet(ss.getSheetByName("DeprovisionCBs"));
    // Log actions to the sheet called Log
    var logsheet = SpreadsheetApp.setActiveSheet(ss.getSheetByName("Log"));
    // Get all data from the second row to the last row with data, and the last column with data
    // Since all text in column D is in the merged cells D1:D14 it only counts as one cell/row
    // Having the text in seprate rows caused a failed API call since it tried to run the empty rows in A.
    var lastrow = sheet.getLastRow();
    var lastcolumn = sheet.getLastColumn();
    var range = sheet.getRange(2, 1, lastrow - 1, lastcolumn);
    var list = range.getValues();
    for (var i = 0; i < list.length; i++) {
      // Grab serial number from the first column (0) 
      var serno = list[i][0];
      // Grab deprovision reason from the second column (1)
      var depReason = list[i][2];
      // Since we provided serial numbers, convert each to device-id
      var sernoquery = "id:" + serno;
      // Use AdminSDK API to check if the cros device exists. Else the update will fail
      try {
        var chromebooklist = AdminDirectory.Chromeosdevices.list('my_customer', { query: sernoquery }).chromeosdevices;
        if (!chromebooklist) {
          // Logger.log("Device not found, probably typo in the serial");
          logsheet.appendRow([new Date(), userEmail, serno, "FAILED DEPROVISON - Device not found, probably typo in the serial"]);
        } else if (chromebooklist.length !== 1) {
          logsheet.appendRow([serno, chromebooklist.length + " found"]);
        } else {
          var id = chromebooklist[0].deviceId;
          // For each line, try to update the device with given data, and log the result
          try {
            if (list[i][2]) {
              AdminDirectory.Chromeosdevices.action({ "action": "deprovision", "deprovisionReason": depReason }, 'my_customer', id);
              // Logger.log("Device actually deprovisioned here")
              if (list[i][1]) {
                var newOU = list[i][1];
                // Logger.log("Device moved and deprovisioned")
                AdminDirectory.Chromeosdevices.update({ orgUnitPath: newOU }, 'my_customer', id);
                logsheet.appendRow([new Date(), userEmail, serno, "Device deprovisioned" + ", " + depReason + " and moved to " + newOU]);
              } else {
                // Logger.log("Device deprovisioned without move")
                logsheet.appendRow([new Date(), userEmail, serno, "Device deprovisioned" + ", " + depReason]);
              }
            } else {
              // Logger.log("You forgot to select a deprovision reason")
              logsheet.appendRow([new Date(), userEmail, serno, "FAILED DEPROVISON - You forgot to select a deprovision reason"]);
            }
            // If the update fails for some reason, log the error
          } catch (err) {
            // Logger.log(err.message);
            checkError = err.message;
            alreadyDeprovisioned = "Illegal device state transition";
            invalidInput = "Invalid Input"
            if (checkError.includes(alreadyDeprovisioned)) {
              // Logger.log("Device already deprovisioned")
              logsheet.appendRow([new Date(), userEmail, serno, "FAILED DEPROVISON - Device already deprovisioned"]);
            }
            else if (checkError.includes(invalidInput)) {
              // Logger.log("Serial missing")
              logsheet.appendRow([new Date(), userEmail, serno, "FAILED DEPROVISON - Serial missing"]);
            } else {
              logsheet.appendRow([serno, "FAILED DEPROVISON - " + err]);
            }
          }
        }
        // If the serial check fails for some reason, log the error
      } catch (err) {
        // Logger.log(err.name);
        // Logger.log(err.message);
        checkError = err.message;
        invalidInput = "Invalid Input"
        if (checkError.includes(invalidInput)) {
          // Logger.log("Serial missing or invalid")
          logsheet.appendRow([new Date(), userEmail, serno, "FAILED DEPROVISON - Serial missing or invalid"]);
        } else {
          // Logger.log("Failed for some unknown reason - log it")
          logsheet.appendRow([serno, "FAILED DEPROVISON - " + err]);
        }
      }
    }
  } else {
    // This doesn't have to be active; only relevant during development and debugging
    // Logger.log('The user clicked "No" or the close button in the dialog\'s title bar.');
  }
}

/**
* Last edit: 20220903-1016, added optional move on deprovision, requirement of depReason,
* and added most likely reponse why dep failed, also parsing error if bad/no serial,
* also set all columns to clip text, so empty cells stand out more.
*/
