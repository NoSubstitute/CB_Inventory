function findUserOUs() {
  // Get User/Operator Info
  var userEmail = Session.getActiveUser().getEmail()
  // Get the current spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Set the first (0) sheet as the sheet we're working in
  //var sheet = ss.getSheets()[0];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dislocated');
  // Log actions to the second (1) sheet
  var logsheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Located');
  // Get all data from the second row to the last row with data, and the last column with data
  var lastrow = sheet.getLastRow();
  var lastcolumn = sheet.getLastColumn();
  var range = sheet.getRange(2,1,lastrow-1,lastcolumn);
  var list = range.getValues();
    for (var i=0; i<list.length; i++) {
      // Grab serial number from the first column (0), then the rest from adjoing columns and set necessary variables. 
      var serno = list[i][0];
      // Not using the room variable, so just not referring to it.
      //var room = list[i][2].toString();
      var asset = list[i][3].toString();
      // I don't know if the value in i4 can be a string or not, but it works when not a string. Haven't tested as string.
      //var userinfo = list[i][4].toString();
      var userinfo = list[i][4];
      //Moved the setting of userdata inside the try-loop, so the script doesn't crash.
      //var userdata = AdminDirectory.Users.get(userinfo, {fields: 'orgUnitPath'});
      //var userdata = AdminDirectory.Users.get(userinfo);
      //var userou = userdata.orgUnitPath;
      
      var note = list[i][5].toString();      
      var ou = list[i][1].toString();
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
              //This is just residue from the previous function that I re-used the code from.
              //However, one could also choose to make the OU change immediately, instead of just printing it.
              //But, since that would fail with all rows missing a user, I chose not to do that now.
              //var updatecb = AdminDirectory.Chromeosdevices.update({orgUnitPath:ou, notes:note, annotatedUser:user, annotatedAssetId:asset, annotatedLocation:room},'my_customer',id);
              logsheet.appendRow([serno, ou, userou, asset, userinfo, note]);

              // If the update fails for some reason, log the error.
            } catch (err) {
              logsheet.appendRow([serno, err]);
            }
        }
    }
}

/**
Last edit: 201906701-2230
*/
