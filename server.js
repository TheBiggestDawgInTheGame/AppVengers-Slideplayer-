const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const cors = require("cors");
const path = require("path");

const app = express(); // <--- This line fixes the "app is not defined" error!

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- DATABASE CONNECTION ---
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "slideplayer_database",
  password: "1738EYY!",
  port: 5432,
});

// --- ROUTES ---

// 1. Home / Landing Page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 2. Signup Route (With Validation Checks)
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if Username already exists
    const userCheck = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username],
    );
    if (userCheck.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "Username taken. Please login instead." });
    }

    // Check if Email already exists
    const emailCheck = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );
    if (emailCheck.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "Email already in use. Please use another email." });
    }

    // Hash and Save
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)",
      [username, email, hashedPassword],
    );

    res.status(201).json({ message: "Success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error occurred." });
  }
});

// 3. Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (isMatch) {
      res.status(200).json({ message: "Success" });
    } else {
      res.status(401).json({ message: "Invalid username or password" });
    }
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// --- START SERVER ---
app.listen(3000, () => {
  console.log("🚀 Server is running on http://localhost:3000");
});
