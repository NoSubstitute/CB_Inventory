function findUserOUs() {
  // Get User/Operator Info
  var userEmail = Session.getActiveUser().getEmail()
  // Get the current spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Set the Dislocated sheet as the sheet we're working in
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dislocated');
  // Log result to the Located sheet
  var logsheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Located');
  // Get all data from the second row to the last row with data, and the last column with data
  var lastrow = sheet.getLastRow();
  var lastcolumn = sheet.getLastColumn();
  var range = sheet.getRange(2,1,lastrow-1,lastcolumn);
  var list = range.getValues();
    for (var i=0; i<list.length; i++) {
      // Grab serial number from the first column (0), then the rest from adjoing columns and set necessary variables. 
      var serno = list[i][0];
      //Ignore deviceou as we're going to replace it with userou in Located!B2:B
      //var ou = list[i][1].toString();
      // Grab location, so we can reuse it in Located
      var location = list[i][2].toString();
      //Don't grab assetid, as we're going to replace it with the fullName of the user in Located!D2:D
      //var asset = list[i][3].toString();
      // I don't know if the value in i4 can be a string or not, but it works when not a string - Haven't tested as string
      //var userinfo = list[i][4].toString();
      // Grab the userinfo from column Most Recent User (6/G) and ignore old user in column 4/E
      var userinfo = list[i][6];
      // Grab notes, so we can reuse it in Located
      var note = list[i][5].toString();      
      // Since we provided serial numbers, convert each to device-id.
      var sernoquery = "id:"+serno;
      // Use AdminSDK API to check if the cros device exists. Else the update will fail.
      var chromebooklist = AdminDirectory.Chromeosdevices.list('my_customer', {query: sernoquery}).chromeosdevices;
        if (!chromebooklist) {
          logsheet.appendRow([serno, "not found"]);
        } else if (chromebooklist.length !== 1) {
          logsheet.appendRow([serno, chromebooklist.length+" found"]);
        } else {
          var id = chromebooklist[0].deviceId;
          // For each line, try to update the device with given data, and log the result.
            try {              
                    var userdata = AdminDirectory.Users.get(userinfo);
                    var userou = userdata.orgUnitPath;
                    var asset = userdata.name.fullName;
              logsheet.appendRow([serno, userou, location, asset, userinfo, note]);

              // If the update fails for some reason, log the error.
            } catch (err) {
              logsheet.appendRow([serno, err]);
            }
        }
    }
}

/**
Last edit: 20210201-1745, find and add fullName of MostRecentUser and put it in AssetID of Located
*/
