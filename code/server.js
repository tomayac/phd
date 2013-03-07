var request = require('request');
var express = require('express');
var http = require('http');
var querystring = require('querystring');
var jsdom = require('jsdom');
var app = express();
var server = http.createServer(app);
global.io = require('socket.io').listen(server);
var Step = require('./step.js');
var Uri = require('./uris.js');
var mediaFinder = require('./mediafinder.js');
var speak = require('./speak.js');

var GLOBAL_config = {
  DEBUG: true
};

// start static serving
// and set default route to index.html
app.use(express.static(__dirname + '/static'));

app.configure('development', function() {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});

app.get('/', function(req, res) {
  res.sendfile(__dirname + '/index.html');
});

app.get(/^\/search\/(.+)\/(.+)$/, search);

app.get(/^\/proxy\/(.+)$/, proxy);

app.get(/^\/speech\/(.+)$/, speech);

function proxy(req, res, next) {
  var path = /^\/proxy\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var url = decodeURIComponent(pathname.replace(path, '$1'));
  if (GLOBAL_config.DEBUG) console.log('Proxy request for ' + url);
  io.sockets.emit('proxy', {
    url: url
  });
  try {
    res.setHeader('Cache-Control', 'max-age=7200, must-revalidate');
    request.get(url).pipe(res);
  } catch(e) {
    res.statusCode = 404;
    res.send('Error 404 File not found.');
  }
  /*
  request(url, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      res.setHeader('Content-Length', response.headers['content-length']);
      res.setHeader('Content-Type', response.headers['content-type']);

      var data = '';
      response.on('data', function(chunk) {
        data += chunk;
      });

      response.on('close', function() {
        res.send(data);
      });
    } else {
      res.statusCode = 404;
      res.send('Error 404. File not found.');
    }
  });
  */
}

function search(req, res, next) {
  // actual code begins, up to here we only had helper functions
  var path = /^\/search\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var query = decodeURIComponent(pathname.replace(path, '$2'));
  var userAgent = req.headers['user-agent'];
  mediaFinder.search(service, query, userAgent, function(json) {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With');
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
      res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With');
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
console.log('node.JS running on ' + port);