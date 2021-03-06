'use strict';

var request = require('request');
var express = require('express');
var fs = require('fs');
var http = require('http');
var jsdom = require('jsdom');
var app = express();
app.use(express.bodyParser({
  maxFieldsSize: '100 * 1024 * 1024 * 1024'
}));
var server = http.createServer(app);
/* global io:false */
global.io = require('socket.io').listen(server);
var Step = require('./step.js');
var mediaFinder = require('./mediafinder.js');
var translator = require('./google_translate.js');
var speak = require('./speak.js');
var entityExtractor = require('./entityextraction.js');
var env = require('node-env-file');
env(__dirname + '/.env');

var GLOBAL_config = {
  DEBUG: true
};

app.configure('development', function() {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});

// start static serving
// and set default route to index.html
app.use(express.static(__dirname + '/static'));

app.get('/', function(req, res) {
  res.sendfile(__dirname + '/index.html');
});

app.get(/^\/search\/(.+)\/(.+)$/, search);

app.get(/^\/entityextraction\/(.+)\/(.+)$/, extractEntities);

app.get(/^\/proxy\/(.+)$/, proxy);

app.get(/^\/speech\/(.+)$/, speech);

app.all(/^\/download\/(.+)?$/, download);

app.post(/^\/translation\/$/, translate);

function translate(req, res, next) {
  if (GLOBAL_config.DEBUG) console.log('Translation request');
  if (req.body.toLanguage && req.body.texts) {
    var texts = req.body.texts;
    var toLanguage = req.body.toLanguage;
    var fromLanguage = req.body.fromLanguage;
    translator.translateTexts(texts, fromLanguage, toLanguage,
        function(err, results) {
      if (err) {
        res.statusCode = 400;
        res.send('Error 400 Bad Request.\n\n' + err);
      } else {
        res.send(results);
      }
    });
  } else {
    res.statusCode = 400;
    res.send('Error 400 Bad Request.');
  }
}

function download(req, res, next) {
  if (GLOBAL_config.DEBUG) console.log('Download request');
  if (req.method === 'POST') {
    if (req.body.base64 && req.body.fileName) {
      var base64Data = req.body.base64.replace(/^data:image\/png;base64,/, '');
      var fileName = req.body.fileName;
      fs.writeFile('/tmp/' + fileName, base64Data, 'base64', function(err) {
        res.send({path: fileName});
      });
    } else {
      res.statusCode = 400;
      res.send('Error 400 Bad Request.');
    }
  } else if (req.method === 'GET') {
    var path = /^\/download\/(.+)$/;
    var pathname = require('url').parse(req.url).pathname;
    var fileName = decodeURIComponent(pathname.replace(path, '$1'));
    fs.readFile('/tmp/' + fileName, function(err, data) {
      if (err) {
        res.statusCode = 400;
        res.send('Error 400 Bad Request.');
      } else {
        res.send(data);
      }
    });
  }
}

function proxy(req, res, next) {
  var path = /^\/proxy\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var url = decodeURIComponent(pathname.replace(path, '$1'));
  if (GLOBAL_config.DEBUG) console.log('Proxy request for ' + url);
  io.sockets.emit('proxy', {
    url: url
  });
  res.set({
    'Cache-Control': 'max-age=7200, must-revalidate'
  });
  try {
    request.get(url).pipe(res);
  } catch(e) {
    res.statusCode = 404;
    res.send('Error 404 File not found.');
  }
}

function extractEntities(req, res, next) {
  if (GLOBAL_config.DEBUG) console.log('Entity extraction request');
  var path = /^\/entityextraction\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var text = decodeURIComponent(pathname.replace(path, '$2'));
  entityExtractor.extract(service, text, function(json) {
    res.set({
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'X-Requested-With'
    });
    if (req.query.callback) {
      res.send(req.query.callback + '(' + JSON.stringify(json) + ')');
    } else {
      res.send(json);
    }
  });
}

function search(req, res, next) {
  var path = /^\/search\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var query = decodeURIComponent(pathname.replace(path, '$2'));
  if (GLOBAL_config.DEBUG) console.log('Search request for ' + query);
  var userAgent = req.get('user-agent');
  mediaFinder.search(service, query, userAgent, function(json) {
    res.set({
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'X-Requested-With'
    });
    if (req.query.callback) {
      res.send(req.query.callback + '(' + JSON.stringify(json) + ')');
    } else {
      res.send(json);
    }
  });
}

function speech(req, res, next) {
  var path = /^\/speech\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var words = decodeURIComponent(pathname.replace(path, '$1'));
  if (GLOBAL_config.DEBUG) console.log('Speech request for ' + words);
  speak.say(words, function(src) {
    if (src) {
      res.set({
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'X-Requested-With'
      });
      res.send(JSON.stringify({base64: src}));
    } else {
      res.statusCode = 404;
      res.send('Error 404 File not found.');
    }
  });
}

io.set('log level', 1);
io.sockets.on('connection', function(socket) {
});

var port = process.env.PORT || 8001;
server.listen(port);
console.log('Social Media Illustrator running on ' + port);