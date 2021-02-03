/**
Lists Org Unit, Chrome Device Serial Number, OS Version, Last Synced User, Last Sync Date, device Status, AUE, MAC Addesses, Location, AssetID, User, Make&Model, and Notes to Sheet and sorts by OU.
So, you need to create those columns and put the mentioned headers in row 1.
Also, in the Sheet in cell N1 I put =NOW() and in N2 I put this to calculate how many days since last sync.

=ARRAYFORMULA(IF(LEN(A2:A);DATEDIF(I2:I;N1;"D");))

I then colour code column N with conditional formatting, so I can see which devices haven't been used in a long time.

Just recently I added two columns (O,P) to tell me about my ChromeOS versions.
*/
function exportCBs()
{
  // Set the active sheet be the one called "Devices".
var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Devices');
  // Create an array with the following columns.
var deviceArray = [["Serial Number","Org Unit Path","Location","AssetID","User","Notes","Most Recent User","OS Version","Last Sync","Status","MAC","AUE","Model"]];
  // Start a "page" sequence, so the process can run for a very long time and manage lots of data. If you don't you will quickly error or time-out.
var pageToken, page;
do
{
  // Use the AdminSDK to list all devices.
var response = AdminDirectory.Chromeosdevices.list('my_customer',{ pageToken: pageToken});
var devices = response.chromeosdevices;
if (devices && devices.length > 0) {
for (i = 0; i < devices.length; i++) {
  // For each device pull the data for OU, Serial, ChromeOS, Most Recent User, Last Sync, AUE, MAC Addresses, Model,
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
 if (device.macAddress) {var macAddress = device.macAddress} else {var macAddress = ""}
 if (device.model) {var model = device.model} else {var model = ""}  
 if (device.autoUpdateExpiration) {var autoUpdateExpiration = device.autoUpdateExpiration} else {var autoUpdateExpiration = ""}
  // This one does a double check, as one can be undefined while the other isn't, giving wrong result.
 if (device.recentUsers && device.recentUsers[0].email) {
   var recentUser = device.recentUsers[0].email} else {var recentUser = ""}
   deviceArray.push([device.serialNumber, device.orgUnitPath, location, asset, user, note, recentUser, osversion, lastsync, status, macAddress, autoUpdateExpiration, model])
 }
}
pageToken = response.nextPageToken;
}
while(pageToken);
// Sort columns A2:M according to the content in column B (2). Yes, it's a bit weird that column A sometimes is 0 and other times 1.
// Also set the range the script should update to 13 (M) so it doesn't touch content in columns N+ 
sheet.getRange(1, 1, deviceArray.length, 13).setValues(deviceArray);  
  var range = sheet.getRange("A2:M");
  range.sort(2);
}

/**
Last edit: 20210203-1009, changed the order of the columns to make it easier to copy columns A-G to Dislocated, as source for the Find userou feature
*/
