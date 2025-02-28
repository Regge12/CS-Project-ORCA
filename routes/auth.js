const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const db = require('../db');

const router = express.Router();

// Register Route
router.post('/register', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userExists = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (userExists) return res.status(400).json({ message: "Email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, hashedPassword);

        res.redirect('/index.html');
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Login Route
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.redirect('/index.html'); // Redirect back to login on failure

        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.redirect('/dashboard.html'); // Redirect to dashboard on success
        });
    })(req, res, next);
});


// Logout Route
router.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) return res.status(500).json({ message: "Logout error" });
        res.redirect('/index.html');
    });
});

module.exports = router;
