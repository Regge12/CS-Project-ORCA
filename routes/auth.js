const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const db = require('../db');

const router = express.Router();

// Helper function to validate user input
const validateUserInput = (username, password) => {
    if (!username || !password) {
        return "Username and password are required.";
    }
    if (username.length < 12) {
        return "Username must be at least 12 characters long.";
    }
    if ((username.match(/\d/g) || []).length < 2) {
        return "Username must contain at least two numbers.";
    }
    if (password.length < 8) {
        return "Password must be at least 8 characters long.";
    }
    return null; // No validation errors
};

// Register Route
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate user input
        const validationError = validateUserInput(username, password);
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        // Check if username already exists
        const userExists = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
        if (userExists) {
            return res.status(400).json({ message: "Username already exists" });
        }

        // Hash password and insert user
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashedPassword);

        return res.status(200).json({ message: "User registered successfully!" });
    } catch (err) {
        console.error("Error during registration:", err.message);
        return res.status(500).json({ message: "Server error. Please try again later." });
    }
});

// Login Route
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error("Authentication error:", err.message);
            return res.status(500).json({ message: "Internal server error" });
        }
        if (!user) {
            return res.status(400).json({ message: "Invalid username or password." });
        }

        req.logIn(user, (err) => {
            if (err) {
                console.error("Login error:", err.message);
                return res.status(500).json({ message: "Internal server error" });
            }
            res.redirect("/dashboard.html");
            return
        });
    })(req, res, next);
});

// Logout Route
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Logout error:", err.message);
            return res.status(500).json({ message: "Logout error. Please try again." });
        }
        res.redirect('/index.html');
    });
});

module.exports = router;
