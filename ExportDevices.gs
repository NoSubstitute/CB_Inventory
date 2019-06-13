/**
Lists Org Unit, Chrome Device Serial Number, OS Version, Last Synced User, Last Sync Date, device Status, Location, AssetID, User, and Notes to Sheet and sorts by OU.
So, you need to create those columns and put the mentioned headers in row 1.
Also, in the Sheet in cell K1 I put =NOW() and in K2 I put this to calculate how many days since last sync.

=ARRAYFORMULA(DATEDIF(E2:E;K1;”D”))

I then colour code column K with conditional formatting, so I can see which devices haven't been used in a long time.
*/
function exportCBs()
{
  // Set the active sheet be the one called "Sheets".
var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Devices');
  // Create an array with the following columns.
  var deviceArray = [["Serial Number","Org Unit Path","Location","AssetID","User","Notes","OS Version","Most Recent User","Last Sync","Status"]];
  // Start a "page" sequence, so the process can run for a very long time and manage lots of data. If you don't you will quickly error or time-out.
var pageToken, page;
do
{
  // Use the AdminSDK to list all devices.
var response = AdminDirectory.Chromeosdevices.list('my_customer',{ pageToken: pageToken});
var devices = response.chromeosdevices;
if (devices && devices.length > 0) {
for (i = 0; i < devices.length; i++) {
  // For each device pull the data for OU, Serial, ChromeOS, Most Recent User, Last Sync,
  // Annotated Location, Annotated AssetId, Annotated User and Notes, and set the appropriate variables.
  // If the field doesn't have any data, set "", so the variable is empty, and doesn't print "undefined" in the cell.
 var device = devices[i];
 if (device.status) {var status = device.status} else {var status = ""}
 if (device.lastSync) {var lastsync = new Date(device.lastSync)} else {var lastsync = ""}
 if (device.osVersion) {var osversion = device.osVersion} else {var osversion = ""}
 if (device.annotatedLocation) {var location = device.annotatedLocation} else {var location = ""}
 if (device.annotatedAssetId) {var asset = device.annotatedAssetId} else {var asset = ""}
 if (device.annotatedUser) {var user = device.annotatedUser} else {var user = ""}
 if (device.notes) {var note = device.notes} else {var note = ""}
  // This one does a double check, as one can be undefined while the other isn't, giving wrong result.
 if (device.recentUsers && device.recentUsers[0].email) {
   var recentUser = device.recentUsers[0].email} else {var recentUser = ""}
   deviceArray.push([device.serialNumber, device.orgUnitPath, location, asset, user, note, osversion, recentUser, lastsync, status])
 }
}
pageToken = response.nextPageToken;
}
while(pageToken);
  // Sort columns A2:J according to the content in column A (1). Yes, it's a bit weird that column A sometimes is 0 and other times 1.
sheet.getRange(1, 1, deviceArray.length, deviceArray[0].length).setValues(deviceArray);
  var range = sheet.getRange("A2:J");
  range.sort(1);
}

/**
Last edit: 20190612-1132
*/
