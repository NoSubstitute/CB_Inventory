function updateChromebook() {
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
      // Grab serial number from the first column (0), then the rest from adjoing columns and set necessary variables
      var serno = list[i][0];
      var room = list[i][2].toString();
      var asset = list[i][3].toString();
      var user = list[i][4].toString();
      var note = list[i][5].toString();      
      var ou = list[i][1].toString();
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
              var updatecb = AdminDirectory.Chromeosdevices.update({orgUnitPath:ou, notes:note, annotatedUser:user, annotatedAssetId:asset, annotatedLocation:room},'my_customer',id);
              logsheet.appendRow([new Date(), userEmail, serno, "Everything applied"+ " OU: "+ ou+ ", Note: "+ note+ ", User: "+ user+ ", Asset: "+ asset+ ", Location: "+ room]);

              // If the update fails for some reason, log the error
            } catch (err) {
              logsheet.appendRow([serno, err]);
            }
        }
    }
}
/**
Last edit: 20201129-1609
*/
