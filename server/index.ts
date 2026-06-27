import { HOSTNAME, PORT } from '../config/ports.ts';
import { startServer } from './startServer.ts';
import { SIGNALING_WS_PATH } from './signaling.ts';

await startServer({ port: PORT }).then((port) => {
  const localUrl = `http://localhost:${port}`;
  const signalingPath = SIGNALING_WS_PATH;
  if (HOSTNAME === '0.0.0.0') {
    console.log(`WhiteBoard4Share running at ${localUrl} (network: http://<this-pc-ip>:${port})`);
  } else {
    console.log(`WhiteBoard4Share running at http://${HOSTNAME}:${port}`);
  }
  console.log(`WebRTC signaling: ws://<host>:${port}${signalingPath}`);
});
