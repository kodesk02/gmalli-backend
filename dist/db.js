"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    user: "macbook",
    host: "localhost",
    database: "marketplace",
    password: "",
    port: 5432,
});
pool.connect((err, client, release) => {
    if (err) {
        console.log('Database failed due to:', err.message);
    }
    else {
        console.log('Connected to postgressSQl');
        release();
    }
});
exports.default = pool;
