function updateChromebook() {
  // Get the current spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Set the first (0) sheet as the sheet we're working in
  var sheet = ss.getSheets()[0];
  // Log actions to the second (1) sheet
  var logsheet = ss.getSheets()[1];
  // Get all data from the second row to the last row with data, and the last column with data
  var lastrow = sheet.getLastRow();
  var lastcolumn = sheet.getLastColumn();
  var range = sheet.getRange(2,1,lastrow-1,lastcolumn);
  var list = range.getValues();
    for (var i=0; i<list.length; i++) {
      // Grab serial number from the first column (0), then the rest from adjoing columns and set necessary variables. 
      var serno = list[i][0];
      var room = list[i][2].toString();
      var asset = list[i][3].toString();
      var user = list[i][4].toString();
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
              
              //var updateloc = AdminDirectory.Chromeosdevices.update({annotatedLocation:room},'my_customer',id); 
              //logsheet.appendRow([serno, "Location "+ room+" applied"]);
              //var update = AdminDirectory.Chromeosdevices.update({annotatedAssetId:asset},'my_customer',id);
              //logsheet.appendRow([serno, "Asset "+ asset+" applied"]);
              //var updateuser = AdminDirectory.Chromeosdevices.update({annotatedUser:user},'my_customer',id);
              //logsheet.appendRow([serno, "User "+ user+" applied"]);
              //var updatenote = AdminDirectory.Chromeosdevices.update({notes:note},'my_customer',id);
              //logsheet.appendRow([serno, "Note "+ note+" applied"]);
              //var updateou = AdminDirectory.Chromeosdevices.update({orgUnitPath:ou},'my_customer',id);
              //logsheet.appendRow([serno, "OU "+ ou+" applied"]);

              // I think running this as a single command is faster. if you want them as separate commands, you can comment these two lines and enable the ten above instead.
              // Maybe you want to even run them as separate functions! That way you could choose to update only certain field/s regardless if the other cells have content or not.
              var updatecb = AdminDirectory.Chromeosdevices.update({orgUnitPath:ou, notes:note, annotatedUser:user, annotatedAssetId:asset, annotatedLocation:room},'my_customer',id);
              logsheet.appendRow([serno, "Everything applied"+ " OU: "+ ou+ ", Note: "+ note+ ", User: "+ user+ ", Asset: "+ asset+ ", Location: "+ room]);

              // If the update fails for some reason, log the error.
            } catch (err) {
              logsheet.appendRow([serno, err]);
            }
        }
    }
}
// The onOpen function is executed automatically every time a Spreadsheet is loaded
function onOpen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var menuEntries = [];
  // When the user clicks on "CB Inventory" then "1. Export devices", the function exportCBs is
  // executed. Here you can easily add more menu entries, if you add more functions/scripts.
  menuEntries.push({name: "1. Export devices", functionName: "exportCBs"});
  menuEntries.push(null); // line separator
  menuEntries.push({name: "2. Update devices from sheet", functionName: "updateChromebook"});
  ss.addMenu("CB Inventory", menuEntries);
}

/**
Last edit: 20190611-1745
*/
