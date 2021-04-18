// If you want to use CB_Inventory with a script menu, enable this upper set of code instead of the bottom set
// Do note that they are slightly different. With a script menu, you can name the first level of the menu
// function onOpen() {
//   var ui = SpreadsheetApp.getUi();
//   // Or DocumentApp or FormApp.
//   ui.createMenu('CB Inventory')
//       .addItem('Export devices', 'exportCBs')
//       .addSeparator()
//       .addItem('Find users OUs for device relocation', 'findUserOUs')
//       .addSeparator()
//       .addItem('Update devices on sheet UpdateCBs', 'updateChromebook')
//       .addSeparator()
//       .addItem('Enable devices on sheet UpdateCBs', 'enableChromebook')
//       .addSeparator()
//       .addItem('Disable devices on sheet UpdateCBs', 'disableChromebook')
//       .addSeparator()
//       .addSubMenu(ui.createMenu('Clear devices')
//       .addItem('Remove profiles from devices on sheet UpdateCBs', 'clearProfiles')
//       .addSeparator()
//       .addItem('Power wash devices on sheet UpdateCBs', 'powerWash'))
//       .addSeparator()
//       .addSubMenu(ui.createMenu('Deprovisioning')
//           .addItem('Deprovision devices from sheet DeprovisionCBs', 'deprovisionChromebook'))
//       .addToUi();
// }

// With the addon menu, the first level of the menu will awlays have the name of the addon/script
function onInstall(e) {
  onOpen(e);
}
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Export devices', 'exportCBs')
    .addSeparator()
    .addItem('Find users OUs for device relocation', 'findUserOUs')
    .addSeparator()
    .addItem('Update devices on sheet UpdateCBs', 'updateChromebook')
    .addSeparator()
    .addItem('Enable devices on sheet UpdateCBs', 'enableChromebook')
    .addSeparator()
    .addItem('Disable devices on sheet UpdateCBs', 'disableChromebook')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Clear devices')
        .addItem('Remove profiles from devices on sheet UpdateCBs', 'clearProfiles')
    .addSeparator()
        .addItem('Power wash devices on sheet UpdateCBs', 'powerWash'))
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Deprovisioning')
        .addItem('Deprovision devices from sheet DeprovisionCBs', 'deprovisionChromebook'))
    .addToUi()
}


/**
Last edit: 
20210418-1616 Turned the menu into an addon menu instead of scripts menu
20210418-1652 Switched the menu back into scripts menu instead of an addon menu, for faster access
20210418-1654 Switched it back again... I want this to be an addon eventually, so better get used to it
*/
