console.log('Test 4: Check global Electron objects');
console.log('global.require:', typeof global.require);
console.log('typeof __dirname:', typeof __dirname);
console.log('typeof __filename:', typeof __filename);

// Check if electron modules are in the global scope or somewhere else
console.log('\nChecking for electron in various places:');
console.log('global.electron:', typeof global.electron);
console.log('process.mainModule:', process.mainModule);

// Try requiring with absolute path
try {
  const electronPath = require.resolve('electron');
  console.log('electron path:', electronPath);
  const fs = require('fs');
  const electronIndex = fs.readFileSync(electronPath, 'utf-8');
  console.log('electron/index.js content (first 500 chars):', electronIndex.substring(0, 500));
} catch (error) {
  console.log('Error reading electron:', error.message);
}

// Check module cache
console.log('\nModule cache keys:', Object.keys(require.cache).filter(k => k.includes('electron')).slice(0, 10));
