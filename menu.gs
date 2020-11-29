function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp or FormApp.
  ui.createMenu('CB Inventory')
      .addItem('Export devices', 'exportCBs')
      .addSeparator()
      .addItem('Find users OUs for device relocation', 'findUserOUs')
      .addSeparator()
      .addItem('Update devices from sheet UpdateCBs', 'updateChromebook')
      .addSeparator()
      .addItem('Enable devices from sheet UpdateCBs', 'enableChromebook')
      .addSeparator()
      .addItem('Disable devices from sheet UpdateCBs', 'disableChromebook')
      .addSeparator() 
      .addSubMenu(ui.createMenu('ATTENTION! Deprovisioning is irreversible!')
          .addItem('Deprovision devices from sheet DeprovisionCBs', 'deprovisionChromebook'))
      .addToUi();
}

/**
Last edit: 20201129-2114
*/
