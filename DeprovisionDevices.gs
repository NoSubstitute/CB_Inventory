function deprovisionChromebook() {
  // Display a dialog box with a message and "Yes" and "No" buttons. The user can also close the
  // dialog by clicking the close button in its title bar.
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('Confirmation: Deprovision Devices','Do you really want to deprovison these devices?', ui.ButtonSet.YES_NO);

  // Process the user's response.
  if (response == ui.Button.YES) {
    Logger.log('Ok, running the deprovision');

  // Get User/Operator Info
  var userEmail = Session.getActiveUser().getEmail()
  // Get the current spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Set the sheet called Deprovision as the sheet we're working in
  var sheet = SpreadsheetApp.setActiveSheet(ss.getSheetByName("DeprovisionCBs"));
  // Log actions to the sheet called Log
  var logsheet = SpreadsheetApp.setActiveSheet(ss.getSheetByName("Log"));
  // Get all data from the second row to the last row with data in A, and the last column with data
  
  //Select the column we will check for the first blank cell
  var columnToCheck = sheet.getRange("A:A").getValues();
  // Get the last row based on the data range of a single column, using a separate function
  var lastRow = getLastRowSpecial(columnToCheck);
  
  var lastcolumn = sheet.getLastColumn();
  var range = sheet.getRange(2,1,lastRow-1,lastcolumn);
  var list = range.getValues();
    for (var i=0; i<list.length; i++) {
      // Grab serial number from the first column (0) 
      var serno = list[i][0];
      // Grab deprovision reason from the second column (1)
      var depReason = list[i][1];
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
              AdminDirectory.Chromeosdevices.action({"action": "deprovision","deprovisionReason": depReason},'my_customer',id);
              logsheet.appendRow([new Date(), userEmail, serno, "Device deprovisioned"+ ", "+ depReason]);

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
/************************************************************************
 *
 * Gets the last row number based on a selected column range values
 *
 * @param {array} range : takes a 2d array of a single column's values
 *
 * @returns {number} : the last row number with a value. 
 *
 */ 

function getLastRowSpecial(range1){
  var rowNum = 0;
  var blank = false;
  for(var row = 0; row < range1.length; row++){

    if(range1[row][0] === "" && !blank){
      rowNum = row;
      blank = true;
    }else if(range1[row][0] !== ""){
      blank = false;
    };
  };
  return rowNum;
};

/**
Last edit: 20210418-1643, set a title on the confirmation prompt
*/
