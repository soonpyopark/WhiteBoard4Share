import { applyConfiguredDataDirToEnv } from './settingsService.ts';
import { startServer, getActiveHostname, getLocalIPv4Addresses } from './startServer.ts';

await applyConfiguredDataDirToEnv();

await startServer().then((port) => {
  const hostname = getActiveHostname();
  const localUrl = `http://127.0.0.1:${port}`;
  if (hostname === '0.0.0.0') {
    const lan = getLocalIPv4Addresses();
    console.log(
      `Whiteboard4Share running at ${localUrl} (LAN: ${lan.map((ip) => `http://${ip}:${port}`).join(', ') || 'none'})`,
    );
  } else {
    console.log(`Whiteboard4Share running at http://${hostname}:${port}`);
  }
});
