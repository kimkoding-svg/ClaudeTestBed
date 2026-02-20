const ngrok = require('@ngrok/ngrok');
const waitOn = require('wait-on');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 5173;

function readAuthtoken() {
  if (process.env.NGROK_AUTHTOKEN) return process.env.NGROK_AUTHTOKEN;

  const configPath = path.join(os.homedir(), 'AppData', 'Local', 'ngrok', 'ngrok.yml');
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/authtoken:\s*(.+)/);
    if (match) return match[1].trim();
  } catch {}

  return null;
}

(async () => {
  const authtoken = readAuthtoken();
  if (!authtoken) {
    console.error('No ngrok authtoken found. Run: npx ngrok authtoken YOUR_TOKEN');
    process.exit(1);
  }

  try {
    console.log('Waiting for Vite to be ready...');
    await waitOn({ resources: [`http-get://localhost:${PORT}`], timeout: 30000 });
    console.log('Vite is ready. Starting ngrok tunnel...');

    const listener = await ngrok.forward({ addr: PORT, authtoken });
    const url = listener.url();
    console.log(`\n  ➜  Public URL: ${url}\n`);

    // Keep the process alive with a heartbeat timer
    setInterval(() => {}, 60_000);
  } catch (err) {
    console.error('ngrok failed:', err.message);
    process.exit(1);
  }
})();
