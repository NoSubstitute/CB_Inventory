function onInstall(e) {
  onOpen(e);
}

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Start', 'showStartSidebar')
    .addSeparator()
    .addItem('About CB_Inventory', 'showAboutDialog')
    .addToUi();
}

function showStartSidebar(targetViewId, targetTitle) {
  JobManager.showJobSidebar({
    mode: 'menu',
    title: targetTitle || 'Main Menu',
    targetViewId: targetViewId || 'menuView'
  });
}

function showAboutDialog() {
  const content = getAboutContent();
  const template = HtmlService.createTemplateFromFile('About');
  template.content = content;
  
  const html = template.evaluate()
    .setWidth(600)
    .setHeight(450);
    
  SpreadsheetApp.getUi().showModalDialog(html, 'About CB_Inventory');
}