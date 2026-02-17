console.log('Test 3: Using process.electronBinding');
console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);

// Try using the remote/electron way
try {
  // In Electron main process, we might need to use a different require pattern
  const { app } = process.electronBinding ?
    process.electronBinding('electron') :
    require('electron');
  console.log('app:', typeof app);
  if (app) {
    app.quit();
  }
} catch (error) {
  console.log('electronBinding error:', error.message);

  // Try the module directly
  try {
    // When running IN electron, the API should be in a different place
    const electron = process._linkedBinding('electron_common_api');
    console.log('via linkedBinding:', typeof electron);
  } catch (e2) {
    console.log('linkedBinding error:', e2.message);
  }
}
