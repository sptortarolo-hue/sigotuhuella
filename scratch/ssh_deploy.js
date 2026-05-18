import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established successfully for DEPLOYMENT!\n');
  
  // Run the deploy script on the VPS after stashing any local package-lock.json changes
  conn.exec('cd /var/www/sigotuhuella && git stash && /bin/bash deploy.sh', (err, stream) => {
    if (err) {
      console.error('Deployment execution error:', err);
      conn.end();
      return;
    }
    stream.on('close', (code, signal) => {
      console.log(`\nDeployment finished with code ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Error during Deployment:', err);
}).connect({
  host: '138.36.236.69',
  port: 5905,
  username: 'root',
  password: 'Javier040484%Noemi110157'
});
