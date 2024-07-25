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
const { v4: uuidv4 } = require('uuid');

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
    const user = await users.findOne({ id: id });
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
            return done(null, user);
        }
        done(null, user);
    }
));

const app = express();
const router = express.Router();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
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
        res.redirect('/main');
    }
);

app.get('/main', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = client.db('to-do');
    const collection = db.collection('to-do');
    var categories = await db.collection('categories').find({ user: req.user.id }).toArray() || [];
    if (!req.query.category) {
        var first = categories[0];
        if (!first) {
            var items = []
            return res.render('index', { items: items, categories: categories, currentCategory: false });
        } else {
                return res.redirect(`/main?category=${first.name}`);
        }
    } 

    var items = await collection.find({ category: req.query.category }).toArray() || [];
    items = items.filter(x => x.users.includes(req.user.id));

    res.render('index', { items: items, categories: categories, currentCategory: req.query.category });


});

router.post('/reminders', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = client.db('to-do');
    const collection = db.collection('to-do');
    var title = req.body.title,
        description = req.body.description,
        date = req.body.date,
        priority = req.body.priority,
        list = req.body.list

    collection.insertOne({
        title: title,
        description: description,
        date: date,
        id: uuidv4(),
        users: [req.user.id],
        creator: req.user.id,
        timestamp: Date.now(),
        completed: false,
        completedBy: null,
        completedTimestamp: null,
        reminded: false,
        category: list,
        priority: priority
    });
    res.redirect('/main');
});

router.patch('/reminders/:id', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = client.db('to-do');
    const collection = db.collection('to-do');

    var id = req.params.id;
    var body = req.body;

    var completed = body.completed;

    await collection.updateOne({ id: id }, { $set: { completed: completed, completedBy: req.user.id, completedTimestamp: Date.now() } });

    res.send('/main');
});

router.post("/categories", async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = client.db('to-do');
    const collection = db.collection('categories');
    console.log(req.body)
    var name = req.body.name;

    await collection.insertOne({
        name: name,
        user: req.user.id
    });

    res.redirect('/main');
});

router.delete('/categories/:name', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = client.db('to-do');
    const collection = db.collection('categories');
    const toDoCollection = db.collection('to-do');

    var name = req.params.name;

    await collection.deleteOne({ name: name });
    await toDoCollection.deleteMany({ category: name });

    res.redirect('/main');
});

app.use('/api', router);

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