import { Pool } from "pg";

const pool = new Pool ({
  user: "macbook",
  host: "localhost",
  database: "marketplace",
  password: "",
  port: 5432,
})

pool.connect((err, client, release) => {
    if(err){
        console.log('Database failed due to:', err.message)
    } else {
        console.log('Connected to postgressSQl')
        release()
    }
})

export default pool;