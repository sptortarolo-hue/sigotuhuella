import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established successfully for DB check!\n');
  
  // Run psql command on the VPS directly
  const query = "SELECT id, email, role, volunteer_status, member_number FROM users WHERE email = 'sptortarolo@gmail.com';";
  conn.exec(`PGPASSWORD=javier040484 psql -h 127.0.0.1 -U sigotuhuella -d sigotuhuella -c "${query}"`, (err, stream) => {
    if (err) {
      console.error('Execution error:', err);
      conn.end();
      return;
    }
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
}).connect({
  host: '138.36.236.69',
  port: 5905,
  username: 'root',
  password: 'Javier040484%Noemi110157'
});
