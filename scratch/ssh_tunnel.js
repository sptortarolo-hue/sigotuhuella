import net from 'net';
import { Client } from 'ssh2';

const sshConfig = {
  host: '138.36.236.69',
  port: 5905,
  username: 'root',
  password: 'Javier040484%Noemi110157'
};

const LOCAL_PORT = 5432;
const REMOTE_PORT = 5432;
const REMOTE_HOST = '127.0.0.1';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established successfully for Tunnel.');
  
  const server = net.createServer((sock) => {
    conn.forwardOut(sock.remoteAddress, sock.remotePort, REMOTE_HOST, REMOTE_PORT, (err, stream) => {
      if (err) {
        console.error('Forwarding error:', err);
        sock.end();
        return;
      }
      sock.pipe(stream).pipe(sock);
    });
  });

  server.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log(`SSH Tunnel running! Local port ${LOCAL_PORT} is now mapped to VPS PostgreSQL port ${REMOTE_PORT}.`);
  });

  server.on('error', (err) => {
    console.error('Local TCP Server Error:', err);
    conn.end();
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
}).connect(sshConfig);
