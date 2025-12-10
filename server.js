const express = require("express");
const path = require("path");
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const app = express();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

app.use(express.static("public"));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const SECRET_KEY = "SUPER_SECRET_KEY";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token" });
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email`,
      [email, hashedPassword]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ id: newUser.id, email: newUser.email }, SECRET_KEY, { expiresIn: "1h" });
    res.status(201).json({ ...newUser, token });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(400).json({ message: "User not found" });
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ message: "Wrong password" });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: "1h" });
    res.json({ token });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, email, role, avatar FROM users WHERE id = $1", [req.user.id]);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/auth/me", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    const { email } = req.body;
    const avatar = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await pool.query(
      `UPDATE users SET email=$1, avatar=COALESCE($2, avatar) WHERE id=$3 RETURNING id, email, role, avatar`,
      [email, avatar, req.user.id]
    );
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/items", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM items ORDER BY created_at DESC");
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query("SELECT * FROM items WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Item not found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/items", authMiddleware, async (req, res) => {
  try {
    const { title, description, image } = req.body;
    const result = await pool.query(
      `INSERT INTO items (title, description, image) VALUES ($1, $2, $3) RETURNING *`,
      [title, description, image]
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/items/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, image } = req.body;
    const result = await pool.query(
      `UPDATE items SET title=$1, description=$2, image=$3 WHERE id=$4 RETURNING *`,
      [title, description, image, id]
    );
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/items/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM items WHERE id=$1", [id]);
    res.json({ message: "Deleted successfully" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 4200;
app.listen(PORT, () => console.log(`SERVER IS RUNNING ON PORT ${PORT}`));
