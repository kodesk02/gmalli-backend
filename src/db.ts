import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.connect((err, client, release) => {
  if (err) {
    console.log("Database failed due to:", err.message);
  } else {
    console.log("Connected to postgressSQl");
    release();
  }
});

export default pool;
