console.log('Test 2: Trying without destructuring');
const electron = require('electron');
console.log('electron type:', typeof electron);
console.log('electron value:', electron);

// Try accessing properties directly
try {
  if (electron && typeof electron === 'object') {
    console.log('Keys:', Object.keys(electron));
    electron.app.disableHardwareAcceleration();
    console.log('Success with object access!');
    electron.app.quit();
  } else {
    console.log('Electron is not an object, it is:', electron);
  }
} catch (error) {
  console.log('Error:', error.message);
}
