require('dotenv').config();
const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
var DiscordStrategy = require('passport-discord').Strategy;
var passport = require('passport');
var session = require('express-session');

var scopes = ['identify'];

const databasePromise = MongoClient.connect(process.env.mongodb, { useNewUrlParser: true });

let client;

databasePromise.then(connection => {
    client = connection;
    console.log('Database connected');
});

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    const db = client.db('to-do');
    const users = db.collection('users');
    const user = await users.findOne({ id });
    done(null, user);
});


passport.use(new DiscordStrategy({
    clientID: process.env.clientID,
    clientSecret: process.env.clientSecret,
    callbackURL: 'https://localhost/auth/discord/callback',
    scope: scopes
},
    async (accessToken, refreshToken, profile, done) => {
        const db = client.db('to-do');
        const users = db.collection('users');
        let user = await users.findOne({ id: profile.id });
        if (!user) {
            user = await users.insertOne(profile);
            return done(null, user.ops[0]);
        }
        done(null, user);
    }
));

const app = express();


app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.sessionSecret,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/profile');
    }
);


app.get('/main', async (req, res) => {
    const db = client.db('to-do');
    const collection = db.collection('to-do');
    var items = await collection.find({ }).toArray();
    items = items.filter(x => x.users.includes(req.user.id));
    res.render('index', { items: items });
});

app.post('/add', async (req, res) => {
    const db = client.db('to-do');
    const collection = db.collection('to-do');
    // 
});



var httpServer = http.createServer(app);
var httpsServer = https.createServer({
    key: fs.readFileSync('localhost.key'),
    cert: fs.readFileSync('localhost.crt')
}, app);

httpServer.listen(80, () => {
    console.log('HTTP Server running on port 80')
});

httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443')
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});