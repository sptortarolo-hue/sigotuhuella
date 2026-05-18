import pool from '../server/db.js';

try {
  const res = await pool.query("SELECT id, email, role, volunteer_status, member_number FROM users WHERE email = 'sptortarolo@gmail.com'");
  console.log('User sptortarolo@gmail.com details:');
  console.log(res.rows[0]);
  
  const allReqs = await pool.query("SELECT * FROM volunteer_requests");
  console.log('\nVolunteer requests in DB:');
  console.log(allReqs.rows);
} catch (err) {
  console.error(err);
} finally {
  await pool.end();
}
