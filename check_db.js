const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, 'data/ssh_agre.db');

const db = new sqlite3.Database(DB_PATH);

db.all("PRAGMA table_info(schedules)", (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Columns in schedules table:');
    rows.forEach(row => console.log(`- ${row.name} (${row.type})`));
  }
  db.close();
});
