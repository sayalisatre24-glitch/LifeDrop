require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== CREATE SERVER FIRST =====
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ===== DB CONFIG (IMPORTANT FIXES) =====
mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false); // ❗ avoids buffering timeout

// ===== MODELS =====
const Message = mongoose.model("Message", {
  room: String,
  senderName: String,
  text: String,
  time: { type: Date, default: Date.now }
});

const SOSAlert = mongoose.model("SOSAlert", {
  blood: String,
  city: String,
  phone: String,
  userName: String,
  time: { type: Date, default: Date.now }
});

const Donor = mongoose.model("Donor", {
  name: String,
  age: Number,
  blood: String,
  contact: String,
  city: String
});

const User = mongoose.model("User", {
  email: String,
  name: String
});

// ===== SOCKET =====
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("joinRoom", (room) => socket.join(room));

  socket.on("sendMessage", async (data) => {
    try {
      const saved = await Message.create(data);
      io.to(data.room).emit("receiveMessage", saved);
    } catch (err) {
      console.error("❌ Message error:", err.message);
    }
  });

  socket.on("sendGlobalSOS", (data) => {
    io.emit("receiveSOS", data);
  });
});

// ===== ROUTES =====

// Health check (VERY IMPORTANT)
app.get("/", (req, res) => {
  res.send("✅ API is running");
});

// Auth init
app.post("/auth/init", async (req, res) => {
  try {
    const { email, mode } = req.body;

    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });

    if (mode === "login" && !user) {
      return res.status(404).json({ message: "No account found." });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth verify
app.post("/auth/verify", async (req, res) => {
  try {
    const { email, name, mode } = req.body;

    let user = await User.findOne({ email });

    if (mode === "register" && !user) {
      user = await User.create({ email, name });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add donor
app.post("/add-donor", async (req, res) => {
  try {
    const donor = await Donor.create(req.body);
    res.json(donor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get donors
app.get("/donors", async (req, res) => {
  try {
    const donors = await Donor.find();
    res.json(donors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Messages
app.get("/messages/:room", async (req, res) => {
  try {
    const msgs = await Message.find({ room: req.params.room }).sort({ time: 1 });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SOS history
app.get("/sos-history", async (req, res) => {
  try {
    const alerts = await SOSAlert.find().sort({ time: -1 }).limit(10);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save SOS
app.post("/save-sos", async (req, res) => {
  try {
    const sos = await SOSAlert.create(req.body);
    res.json(sos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete donor (Admin only)
app.delete("/donors/:id", async (req, res) => {
  try {
    const donor = await Donor.findByIdAndDelete(req.params.id);
    if (!donor) {
      return res.status(404).json({ message: "Donor not found" });
    }
    res.json({ message: "Donor deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== START SERVER (ONLY HERE) =====
const startServer = async () => {
  try {
    console.log("⏳ Connecting to MongoDB...");
    console.log("URI:", process.env.MONGO_URI ? "Loaded ✅" : "Missing ❌");

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("✅ MongoDB Connected");

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error("❌ DB Connection Failed:", err.message);
    process.exit(1); // stop app if DB fails
  }
};

startServer();