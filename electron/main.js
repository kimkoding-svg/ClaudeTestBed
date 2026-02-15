const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Load voice IPC handlers
const voiceIPC = require('./voice-ipc');

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'AI Companion',
    show: false, // Don't show until ready
  });

  // Show window when ready to avoid flashing
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  console.log('App is ready, creating window...');
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Basic IPC handlers (will be expanded later)
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:get-path', (_event, name) => {
  return app.getPath(name);
});

console.log('Main process started');
