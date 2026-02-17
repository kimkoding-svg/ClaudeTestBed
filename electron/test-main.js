console.log('Starting electron test...');
const electron = require('electron');
console.log('electron:', typeof electron);
console.log('electron.app:', typeof electron.app);
console.log('electron.ipcMain:', typeof electron.ipcMain);

const { app, BrowserWindow, ipcMain } = electron;
console.log('After destructuring - app:', typeof app, 'ipcMain:', typeof ipcMain);

if (app) {
  console.log('App exists, trying to use it...');
  app.disableHardwareAcceleration();
  console.log('Success!');
  app.quit();
} else {
  console.log('App is undefined!');
  process.exit(1);
}
