require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./db');
const path = require('path'); // Import path module
const app = express();

// Middleware
app.use(express.urlencoded({ extended: false })); // Parse form data
app.use(express.json()); // Parse JSON data
// Serve static files (IMPORTANT)
app.use(express.static(path.join(__dirname, 'public')));

// Session setup
app.use(session({
    secret: process.env.SECRET_KEY || 'your_secret_key',
    resave: false,
    saveUninitialized: false
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Strategy
passport.use(new LocalStrategy(
    { usernameField: 'email' }, // Use email instead of default username
    (email, password, done) => {
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (!user) return done(null, false, { message: "User not found" });

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) return done(err);
            if (!isMatch) return done(null, false, { message: "Incorrect password" });
            return done(null, user);
        });
    }
));

// Serialize & Deserialize User
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, user);
});

// Middleware to protect routes
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next(); // User is authenticated, allow access
    }
    res.redirect('/index.html'); // Redirect to login page if not authenticated
}

// Serve dashboard.html only if logged in
app.get('/dashboard.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Routes
app.use('/auth', require('./routes/auth'));

app.listen(3000, () => console.log("Server running on port 5000"));
