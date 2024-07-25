require('dotenv').config();
const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

const databasePromise = MongoClient.connect(process.env.mongodb, { useNewUrlParser: true });

databasePromise.then(async client => {
    console.log('Connected to database');
    const db = client.db('to-do');
    const collection = db.collection('to-do');

    var items = await collection.find({}).toArray();

    app.get('/', (req, res) => {
        res.render('index', { items: items });
    });

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