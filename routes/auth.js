const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const SECRET = "SUPER_SECRET_KEY";
const UPLOAD_DIR = "uploads";

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (email,password) VALUES ($1,$2) RETURNING id,email",
      [email, hashed]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error(err);
    if (err.code === "23505") return res.status(400).json({ message: "Email exists" });
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (!result.rows[0]) return res.status(400).json({ message: "User not found" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET);
    res.json({ user: { id: user.id, email: user.email }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get profile
const authMiddleware = require("../middlewares/auth");
router.get("/profile", authMiddleware, async (req, res) => {
  const { rows } = await pool.query("SELECT id,email,avatar FROM users WHERE id=$1", [req.user.id]);
  res.json(rows[0]);
});

// Update profile + avatar
router.put("/profile", authMiddleware, upload.single("avatar"), async (req, res) => {
  const { email, password } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;

  if (email) { fields.push(`email=$${idx++}`); values.push(email); }
  if (password) { const hashed = await bcrypt.hash(password,10); fields.push(`password=$${idx++}`); values.push(hashed); }
  if (req.file) { fields.push(`avatar=$${idx++}`); values.push(`/${UPLOAD_DIR}/${req.file.filename}`); }

  if (fields.length === 0) return res.status(400).json({ message: "No fields to update" });

  const sql = `UPDATE users SET ${fields.join(", ")} WHERE id=$${idx} RETURNING id,email,avatar`;
  values.push(req.user.id);
  const { rows } = await pool.query(sql, values);
  res.json(rows[0]);
});

module.exports = router;
