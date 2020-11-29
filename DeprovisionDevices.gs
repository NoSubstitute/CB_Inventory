function deprovisionChromebook() {
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
      var depReason = list[i][6];
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
              var deprovisioncb = AdminDirectory.Chromeosdevices.action({"action": "deprovision","deprovisionReason": depReason},'my_customer',id);
              logsheet.appendRow([new Date(), userEmail, serno, "Device deprovisioned"+ ", "+ depReason]);

              // If the update fails for some reason, log the error
            } catch (err) {
              logsheet.appendRow([serno, err]);
            }
        }
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
Last edit: 20201129-2138
*/
