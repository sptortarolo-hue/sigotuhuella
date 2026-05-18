import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established successfully!\n');
  
  const cmd = `
    echo "=== Deployed .env files ==="
    find /var/www /home /root -name ".env" -type f -exec grep -H "DATABASE_URL" {} \\; 2>/dev/null
    echo "=== PostgreSQL databases ==="
    su - postgres -c "psql -t -c 'SELECT datname FROM pg_database WHERE datistemplate = false;'" 2>&1
    echo "=== PostgreSQL users ==="
    su - postgres -c "psql -t -c 'SELECT usename FROM pg_user;'" 2>&1
    echo "=== END ==="
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }
    stream.on('close', (code, signal) => {
      console.log('\nSSH session closed with code', code);
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
