// Absolutely minimal Electron test - no dotenv, no external requires
console.log('=== Minimal Electron Test ===');
console.log('1. About to require electron...');

const electron = require('electron');
console.log('2. electron type:', typeof electron);
console.log('3. electron value:', electron);

if (typeof electron === 'object' && electron !== null) {
  console.log('4. electron keys:', Object.keys(electron));
  const { app } = electron;
  console.log('5. app type:', typeof app);

  if (app) {
    console.log('SUCCESS! Electron API loaded correctly');
    app.quit();
  } else {
    console.log('FAIL: app is undefined');
    process.exit(1);
  }
} else {
  console.log('FAIL: electron is not an object');
  process.exit(1);
}
