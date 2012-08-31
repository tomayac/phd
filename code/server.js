var http = require('http');
var https = require('https');
var querystring = require('querystring');
var request = require('request');
var jsdom = require('jsdom');

var Step = require('./step.js');
var Uri = require('./uris.js');

// jspos, Part of Speech tagging
var Lexer = require('./jspos/lexer.js');
var POSTagger = require('./jspos/POSTagger.js');

var express = require('express');
var app = express.createServer();

app.configure(function() {
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/'));
});

app.configure('development', function() {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});

var GLOBAL_config = {
  DEBUG: true,
  TRANSLATE: false,
  PART_OF_SPEECH: false,
  NAMED_ENTITY_EXTRACTION: false,
  USE_GOOGLE_RESEARCH_API: false,
  MOBYPICTURE_KEY: 'TGoRMvQMAzWL2e9t',
  FLICKR_SECRET: 'a4a150addb7d59f1',
  FLICKR_KEY: 'b0f2a04baa5dd667fb181701408db162',
  YFROG_KEY: '89ABGHIX5300cc8f06b447103e19a201c7599962',
  INSTAGRAM_KEY: '82fe3d0649e04c2da8e38736547f9170',
  INSTAGRAM_SECRET: 'b0b5316d40a74dffab16bfe3b0dfd5b6',
  GOOGLE_KEY: 'AIzaSyC5GxhDFxBHTKCLNMYtYm6o1tiagi65Ufc',
  GOOGLE_RESEARCH_API_KEY: 'DQAAAMcAAAAcGiug619uBnQa2Joxo2vPo2Bup-s062p1fLvLpRM9Mc7IdRUeJ-YZUv9BcuXgAdWcg1uu5YrIRLvzA_eojgOmpGF6wF3Bsd5pYAczmtTeNcpgzdWI5otAToWwPkSuRRulDUqAUZdnCXwjuR8XTobYVLNNmO-sqVeXIwaT593vH2eDGycOoYyeDEji0jmPTXkvqV9_T20u7Zb5jWcl2b-Kz5B6n2OuKSIZjRU_8bqKzasAQD5r9ycFY5uWTQPyUA3lFRqdgS0tTDPpFL9-bXFP',
  IMGUR_KEY: '9b7d0e62bfaacc04db0b719c998d225e',
  HEADERS: {
    "Accept": "application/json, text/javascript, */*",
    "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
    "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",    
    "Referer": "http://www.google.com/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
  },
  MEDIA_PLATFORMS: [
    'yfrog.com',
    'instagr.am',
    'flic.kr',
    'moby.to',
    'youtu.be',
    'twitpic.com',
    'lockerz.com',
    'picplz.com',
    'qik.com',
    'ustre.am',
    'twitvid.com',
    'photobucket.com',
    'pic.twitter.com',
    'i.imgur.com',
    'picasaweb.google.com',
    'twitgoo.com',
    'vimeo.com',
    'img.ly',
    'mypict.me'],
  URL_REGEX: /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/ig,
  HASHTAG_REGEX: /(^|\s)\#(\S+)/g,
  USER_REGEX: /(^|\W)\@([a-zA-Z0-9_]+)/g,
  PLUS_REGEX: /(^|\W)\+([a-zA-Z0-9_]+)/g,
  TAG_REGEX: /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
};

app.get("/", function(req, res) {
  res.redirect("/index.html");
});

app.get(/^\/search\/(.+)\/(.+)$/, search);

app.get(/^\/proxy\/(.+)\/(.+)$/, proxy);

function proxy(req, res, next) {
  var path = /^\/proxy\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var url = decodeURIComponent(pathname.replace(path, '$1'));
  console.log('Proxy request for ' + url);
  request.get(url).pipe(res);
}

function search(req, res, next) { 
   
  /** 
   * Stolen from https://developer.mozilla.org/en/JavaScript/Reference/Global_-
   * Objects/Date#Example:_ISO_8601_formatted_dates
   */
  function getIsoDateString(d) {  
   function pad(n) { return n < 10 ? '0' + n : n }
   d = new Date(d);
   return d.getUTCFullYear() + '-' +
        pad(d.getUTCMonth() + 1) + '-' +
        pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) + ':' +
        pad(d.getUTCMinutes()) + ':' +
        pad(d.getUTCSeconds()) + 'Z';
  }
  
  /**
   * Cleans video URLs, tries to convert YouTube URLS to HTML5 versions
   */
  function cleanVideoUrl(url, callback) {
    // if is YouTube URL
    if ((url.indexOf('http://www.youtube.com') === 0) || 
        (url.indexOf('https://www.youtube.com') === 0)) {
      try {
        var urlObj = new Uri(url);
        var host = urlObj.heirpart().authority().host();
        var path = urlObj.heirpart().path();
        var pathComponents = path.split(/\//gi);    
        var videoId;
        if (pathComponents[1] === 'v') {
          // URL of 'v' type:
          // http://www.youtube.com/v/WnszesKUXp8
          videoId = pathComponents[2];
        } else if (pathComponents[1] === 'watch') {   
          // URL of "watch" type:
          // http://www.youtube.com/watch?v=EVBsypHzF3U
          var query = urlObj.querystring();
          query.substring(1).split(/&/gi).forEach(function(param) {
            var keyValue = param.split(/=/gi);
            if (keyValue[0] === 'v') {
              videoId = keyValue[1];            
            }
          });        
        }
        // Translate to HTML5 video URL, try at least
        Step(
          function() {
            var that = this;
            var options = {
              url: 'http://tomayac.com/youpr0n/getVideoInfo.php?video=' +
                  videoId
            }
            request.get(options, function(err, res, body) {
              that(null, body);
            });
          },
          function(err, body) {            
            var html5Url = false;
            try {
              var response = JSON.parse(body);              
              for (var i = 0, len = response.length; i < len; i++) {
                var data = response[i];
                if (data.type.indexOf('video/webm') === 0) {
                  html5Url = data.url;
                  break;
                }
              }
              // if either embedding forbidden or no HTML5 version available,
              // use the normalized YouTube URL
              if (!html5Url) {
                html5Url = 'http://www.youtube.com/watch?v=' + videoId;
              }
              callback(html5Url);
            } catch(e) {
              callback(html5Url);
            }
          }
        );        
      } catch(e) {
        callback(url);
      }
    } else {
      callback(url);      
    }
  }
  
  /**
   * Replaces HTML entities
   */
  function replaceHtmlEntities(message) {
    message = message.replace(/&quot;/gi, '\"');      
    message = message.replace(/&apos;/gi, '\'');      
    message = message.replace(/&#39;/gi, '\'');      
    message = message.replace(/&amp;/gi, '&');  
    message = message.replace(/&gt;/gi, '>');  
    message = message.replace(/&lt;/gi, '<');  
    return message;    
  }

  /**
   * Removes line breaks, double spaces, HTML tags, HTML entities, etc.
   */
  function cleanMessage(message) {
    if (message) {      
      // replace HTML entities
      message = replaceHtmlEntities(message);
      // remove HTML tags. regular expression stolen from 
      // https://raw.github.com/kvz/phpjs/master/functions/strings/strip_tags.js
      var cleanMessage = message.replace(GLOBAL_config.TAG_REGEX, '');
      // replace line feeds and duplicate spaces
      message = message.replace(/[\n\r\t]/gi, ' ').replace(/\s+/g, ' ');            
      //all regular expressions below stolen from
      // https://raw.github.com/cramforce/streamie/master/public/lib/stream/-
      // streamplugins.js
      //
      // remove urls
      cleanMessage = cleanMessage.replace(GLOBAL_config.URL_REGEX, ' ');      
      // simplify #hashtags to hashtags
      cleanMessage = cleanMessage.replace(GLOBAL_config.HASHTAG_REGEX, ' $2');
      // simplify @username to username
      cleanMessage = cleanMessage.replace(GLOBAL_config.USER_REGEX, ' $2');      
      // simplify +username to username
      cleanMessage = cleanMessage.replace(GLOBAL_config.PLUS_REGEX, ' $2');            
      return {
        text: message.replace(/^\s+|\s+$/, ''), // trim
        clean: cleanMessage.replace(/^\s+|\s+$/, '') // trim
      };          
    }
  }
  
  /**
   * Scrapes Yfrog
   */
  function scrapeYfrog(body) {
    try {
      var scraperTag1 = '<image_link>';
      var scraperTag2 = '</image_link>';
      var scraperTagLength = scraperTag1.length;
      var start = body.indexOf(scraperTag1) + scraperTagLength;
      var end = body.indexOf(scraperTag2);                          
      return body.substring(start, end);
    } catch(e) {
      throw('ERROR: Yfrog screen scraper broken');      
      return false;
    }
  }
  
  /**
   * Scrapes TwitPic
   */
  function scrapeTwitPic(body, callback) {
    var mediaurl = false;
    jsdom.env(body, function(errors, window) {
      var $ = window.document; 
      try {
        mediaurl = $.getElementsByTagName('IMG')[1].src;
        callback(mediaurl);
      } catch(e) { 
        if (body.indexOf('error') === -1) {        
          throw('ERROR: TwitPic screen scraper broken');          
        }
        callback(false);          
      }  
    });    
  } 

  /**
   * Scrapes img.ly
   */
  function scrapeImgLy(body, callback) {
    var mediaurl = false;
    jsdom.env(body, function(errors, window) {
      var $ = window.document; 
      var match = 'the-image';
      try {
        mediaurl = $.getElementById(match).src;
        callback(mediaurl);
      } catch(e) { 
        throw('ERROR: img.ly screen scraper broken');          
        callback(false);          
      }  
    });    
  } 

  /**
   * Scrapes MySpace
   */
  function scrapeMySpace(body, callback) {
    var caption = false;
    var timestamp = false;
    if (!body) {
      callback({
        caption: false,
        timestamp: false
      });      
    }
    jsdom.env(body, function(errors, window) {
      var $ = window.document; 
      try {
        caption = $.getElementById('photoCaption').textContent;
        body =
            $.getElementsByTagName('body')[0].textContent.replace(/\s+/g, ' ');
        var match = '"unixTime":';        
        var timeStart = (body.indexOf(match) + match.length);
        var timeEnd = body.substring(timeStart).indexOf(',') + timeStart;
        timestamp = parseInt(body.substring(timeStart, timeEnd) + '000', 10);
        callback({
          caption: caption,
          timestamp: timestamp
        });
      } catch(e) {
        // private profiles are not the fault of the scraper, everything else is
        if (body.indexOf('Sorry, ') === -1) {        
          throw('ERROR: MySpace screen scraper broken');
        }
        callback({
          caption: false,
          timestamp: false
        });
      }
    });    
  } 
  
  /**
   * Annotates messages with DBpedia Spotlight
   */  
  function spotlight(json) {    
    if (!GLOBAL_config.NAMED_ENTITY_EXTRACTION) {
      return sendResults(json);
    }
    if (GLOBAL_config.DEBUG) console.log('spotlight');    
    var currentService = 'DBpediaSpotlight';
    var options = {
      headers: {
        "Accept": 'application/json'
      },
      body: ''     
    };  
    var collector = {};
    var httpMethod = 'POST' // 'GET';
    options.method = httpMethod;
    Step(
      function() {
        var group = this.group();
        var services = typeof json === 'object' ? Object.keys(json) : [];
        services.forEach(function(serviceName) {                    
          var service = json[serviceName] || [];
          collector[serviceName] = [];
          service.forEach(function(item, i) {              
            var text;
            if ((item.message.translation) &&
                (item.message.translation.text) &&
                (item.message.translation.language !== 'en')) {            
              // for non-English texts, use the translation if it exists
              text = item.message.translation.text;        
            } else {
              // use the original version
              text = item.message.clean;
            } 
            if (httpMethod === 'POST') {        
              options.headers['Content-Type'] =
                  'application/x-www-form-urlencoded; charset=UTF-8';        
              // non-testing env: 'http://spotlight.dbpedia.org/rest/annotate';                        
              options.url = 'http://spotlight.dbpedia.org/dev/rest/annotate';              
              options.body =
                  'text=' + encodeURIComponent(text) + 
                  '&confidence=0.2&support=20';            
            } else {
              // non-testing env: 'http://spotlight.dbpedia.org/rest/annotate' +
              options.url = 'http://spotlight.dbpedia.org/dev/rest/annotate' + 
                  '?text=' + encodeURIComponent(text) + 
                  '&confidence=0.2&support=20';                          
            }
            var cb = group();  
            request(options, function(err, res, body) {
              if (!err && res.statusCode === 200) {
                var response;
                try {
                  response = JSON.parse(body);
                } catch(e) {
                  // error
                  collector[serviceName][i] = [];   
                  return cb(null);                  
                }                    
                if (response.Error || !response.Resources) {
                  // error            
                  collector[serviceName][i] = [];
                  return cb(null);
                }
                var entities = [];      	              
                if (response.Resources) {                
                  var uris = {};
                  var resources = response.Resources;
                  for (var j = 0, len = resources.length; j < len; j++) {
                    var entity = resources[j];              
                    // the value of entity['@URI'] is not unique, but we only
                    // need it once, we simply don't care about the other
                    // occurrences
                    var currentUri = entity['@URI'];
                    if (!uris[currentUri]) {
                      uris[currentUri] = true;
                      entities.push({
                        name: entity['@surfaceForm'],
                        relevance: parseFloat(entity['@similarityScore']),
                        uris: [{
                          uri: currentUri,
                          source: currentService
                        }],
                        source: currentService
                      });                                        
                    }
                  }                            
                }   
                // success
                collector[serviceName][i] = entities;
              } else {
                // error
                collector[serviceName][i] = [];
              }
              cb(null);            
            });          
          });   
        });         
      },
      function(err) {     
        var services = typeof json === 'object' ? Object.keys(json) : [];
        services.forEach(function(serviceName) {          
          var service = json[serviceName] || [];
          service.forEach(function(item, i) {  
            item.message.entities = collector[serviceName][i];     
            // part of speech tagging, PoS
            if (GLOBAL_config.PART_OF_SPEECH) {            
              var words;
              if ((item.message.translation) &&
                  (item.message.translation.text) &&
                  (item.message.translation.language !== 'en')) {            
                // for non-English texts, use the translation if it exists    
                words = new Lexer().lex(item.message.translation.text);
              } else {
                words = new Lexer().lex(item.message.clean);              
              }  
              var taggedWords = new POSTagger().tag(words);                        
              var result = [];
              for (var j = 0, len = taggedWords.length; j < len; j++) {
                var taggedWord = taggedWords[j];
                // for all recognized noun types
                if ((taggedWord[1] === 'NNS') ||
                    (taggedWord[1] === 'NNPS') ||
                    (taggedWord[1] === 'NNP')) {
                  var word = taggedWord[0];
                  var tag = taggedWord[2];
                  result.push({
                    word: word.toLowerCase(),
                    tag: tag
                  });
                }
                item.message.nouns = result;            
              }
            }
          });
        });
        sendResults(json);
      }  
    );        
  }

  /**
   * Translates messages one by one
   */
  function translate(json) {
    if (GLOBAL_config.DEBUG) console.log('translate');    
    var options;
    if (GLOBAL_config.USE_GOOGLE_RESEARCH_API) {
      /*
      options = {
        headers: {
          "X-HTTP-Method-Override": 'GET',
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Authorization": "GoogleLogin auth=" +
              GLOBAL_config.GOOGLE_RESEARCH_API_KEY 
        },
        method: 'POST',
        url: 'http://translate.google.com/researchapi/translate',
        body: 'tl=en'
      };
      */  
      options = {
        headers: {
          "X-HTTP-Method-Override": 'GET',
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Authorization": "GoogleLogin auth=" +
              GLOBAL_config.GOOGLE_RESEARCH_API_KEY 
        },
        method: 'POST',
        url: 'https://www.googleapis.com/language/translate/v2',
        body: 'key=' + GLOBAL_config.GOOGLE_RESEARCH_API_KEY + '&target=en'
      };
      
    } else {
      options = {
        headers: {
          "X-HTTP-Method-Override": 'GET',
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        method: 'POST',
        url: 'https://www.googleapis.com/language/translate/v2',
        body: 'key=' + GLOBAL_config.GOOGLE_KEY + '&target=en'
      };        
    }
    var collector = {};
    Step(
      function() {
        var group = this.group();
        var services = typeof json === 'object' ? Object.keys(json) : [];
        services.forEach(function(serviceName) {          
          var cb = group();                    
          var service = json[serviceName] || [];
          collector[serviceName] = [];
          service.forEach(function(item, i) {  
            var text = item.message.clean;        
            if (GLOBAL_config.USE_GOOGLE_RESEARCH_API) {
              //options.body = 'tl=en&q=' + encodeURIComponent(text);
              options.body += '&q=' + encodeURIComponent(text);
            } else {
              options.body += '&q=' + encodeURIComponent(text);
            }
            collector[serviceName][i] = {
              text: '',
              language: ''
            };               
          });
          request(options, function(err1, res1, body) {    
//  FixMe console.log(JSON.stringify(options))
              var response;
              if (GLOBAL_config.USE_GOOGLE_RESEARCH_API) {
// FixMe console.log('hello')
// FixMe res.send(body);
              } else {
                if (!err1 && res1.statusCode === 200) {                
                  try {
                    response = JSON.parse(body);
                  } catch(e) {
                    // error
                    return cb(null);                
                  }                    
                  if ((response.data) &&
                      (response.data.translations) &&
                      (Array.isArray(response.data.translations))) {                
                    response.data.translations.forEach(function(translation, j) {                    
                      collector[serviceName][j] = {
                        text: replaceHtmlEntities(translation.translatedText),
                        language: translation.detectedSourceLanguage
                      };
                    });
                  }                
                } else {
                  // error
                  return cb(null);              
                }                  
              }
              cb(null);            
          });                              
        });         
      },
      function(err) {   
        var services = typeof json === 'object' ? Object.keys(json) : [];
        services.forEach(function(serviceName) {          
          var service = json[serviceName] || [];
          service.forEach(function(item, i) {  
            item.message.translation = collector[serviceName][i];
          });
        });
        spotlight(json);
      }  
    );   
  } 
  
  /**
   * Collects results to be sent back to the client
   */
  function collectResults(json, service, pendingRequests) {
    if (GLOBAL_config.DEBUG) console.log('collectResults for ' + service);    
    if (!pendingRequests) {
      if (service !== 'combined') {
        var temp = json;
        json = {};
        json[service] = temp;
      }
      // make sure that after a timeout, where a service's result can still be
      // the initial value of boolean false, we set the value to empty array
      var services = typeof json === 'object' ? Object.keys(json) : [];
      services.forEach(function(serviceName) {          
        if (json[serviceName] === false) {
          json[serviceName] = [];
        }
      });
      if (GLOBAL_config.TRANSLATE) {
        translate(json);      
      } else {
        spotlight(json);
      }
    } else {
      pendingRequests[service] = json;
    }
  }
  
  /**
   * Sends results back to the client
   */
  function sendResults(json) {
    if (GLOBAL_config.DEBUG) console.log('sendResults');    
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With');    
    if (req.query.callback) {      
      res.send(req.query.callback + '(' + JSON.stringify(json) + ')');      
    } else {
      res.send(json);
    }    
  }
    
  // actual code begins, up to here we only had helper functions
  var path = /^\/search\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var query = decodeURIComponent(pathname.replace(path, '$2'));  

  var services = {   
    GooglePlus: function(pendingRequests) {
      var currentService = 'GooglePlus';
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);       
      var options = {
        url: 'https://www.googleapis.com/plus/v1/activities?query=' +
            encodeURIComponent(query) +
            '&orderBy=recent&key=' + GLOBAL_config.GOOGLE_KEY,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) {
        var results = [];
        try {
          body = JSON.parse(body);          
          if (body.items && Array.isArray(body.items)) {
            body.items.forEach(function(item) {
              // only treat posts and shares, no check-ins
              if (((item.verb === 'share') || (item.verb === 'post')) &&
                  (item.object.attachments) &&
                  (Array.isArray(item.object.attachments))) {
                item.object.attachments.forEach(function(attachment) {    
                  // only treat photos and videos, skip articles
                  if ((attachment.objectType !== 'photo') &&
                      (attachment.objectType !== 'video')) {
                    return;
                  }
                  // the message can consist of different parts, dependent on the
                  // item type
                  var message = cleanMessage(
                      (item.object.content ?
                          item.object.content : '') +
                      (item.title ?
                          ' ' + item.title : '') +    
                      (item.annotation ?
                          ' ' + item.annotation : '') +
                      (attachment.displayName ?
                          ' ' + attachment.displayName : ''));
                  if (message) {        
                    results.push({
                      mediaurl: (attachment.fullImage ?
                          attachment.fullImage.url :
                          (attachment.embed ? 
                              attachment.embed : attachment.url)),
                      storyurl: item.url,                      
                      message: message,
                      user: item.actor.url,
                      type: attachment.objectType,
                      timestamp: (new Date(item.published)).getTime(),
                      published: item.published
                    });                    
                  }
                });
              }
            });
            collectResults(results, currentService, pendingRequests);                                    
          } else {
            collectResults(results, currentService, pendingRequests);                          
          }
        } catch(e) {
          collectResults(results, currentService, pendingRequests);                                    
        }
      });       
    },
    MySpace: function(pendingRequests) {
      var currentService = 'MySpace';  
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);       
      var params = {
        searchTerms: query,
        count: 10,
        sortBy: 'recent'        
      };
      params = querystring.stringify(params);
      var options = {
        url: 'http://api.myspace.com/opensearch/images?' + params,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) {
        var results = [];
        // when no results are found, the MySpace API returns 404
        if (reply.statusCode === 404) {
          collectResults(results, currentService, pendingRequests);
          return;
        }
        try {
          body = JSON.parse(body);
          if (body.entry && Array.isArray(body.entry)) {
            var items = body.entry;
            Step(
              function() {
                var group = this.group();                          
                items.forEach(function(item) {
                  var cb = group();
                  var user = item.profileUrl;
                  var storyurl = user + '/photos/' + item.imageId;
                  var mediaurl = item.thumbnailUrl.replace(/m\.jpg$/, 'l.jpg');
                  var options = {
                    url: storyurl,
                    headers: GLOBAL_config.HEADERS
                  };
                  request.get(options, function(err, reply, body) {
                    scrapeMySpace(body, function(scrapeResult) {                  
                      if (scrapeResult.timestamp && scrapeResult.caption) {
                        results.push({
                          mediaurl: mediaurl,
                          storyurl: storyurl,                      
                          message: cleanMessage(scrapeResult.caption),
                          user: user,
                          type: 'photo',
                          timestamp: scrapeResult.timestamp,
                          published: getIsoDateString(scrapeResult.timestamp)
                        });                    
                      }
                      cb(null);
                    });
                  });
                });
              },
              function(err) {
                collectResults(results, currentService, pendingRequests);                
              }
            );            
          } else {
            collectResults(results, currentService, pendingRequests);                          
          }        
        } catch(e) {
          collectResults(results, currentService, pendingRequests);                                    
        }
      });       
    },
    /*
    MySpaceVideos: function(pendingRequests) {
      var currentService = 'MySpaceVideos';  
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);       
      var params = {
        searchTerms: query,
        count: 10,
        sortBy: 'recent'        
      };
      params = querystring.stringify(params);
      var options = {
        url: 'http://api.myspace.com/opensearch/videos?' + params,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) {
        res.send(body);
      });       
    },
    */
    Facebook: function(pendingRequests) {      
      var currentService = 'Facebook';  
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);       
      var params = {
        q: query
      };
      params = querystring.stringify(params);
      var options = {
        url: 'https://graph.facebook.com/search?' + params + '&type=post',
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) { 
        try {
          body = JSON.parse(body);
          var results = [];
          if ((body.data) && (body.data.length)) {
            var items = body.data;
            Step(
              function() {
                var group = this.group();            
                items.forEach(function(item) {
                  if (item.type !== 'photo' && item.type !== 'video') {
                    return;
                  }
                  var cb = group();
                  var timestamp = Date.parse(item.created_time);
                  var message = '';
                  message += (item.name ? item.name : '');
                  message += (item.caption ?
                      (message.length ? '. ' : '') + item.caption : '');
                  message += (item.description ?
                      (message.length ? '. ' : '') + item.description : '');
                  message += (item.message ?
                      (message.length ? '. ' : '') + item.message : '');                            
                  var mediaUrl = item.type === 'video' ?
                      item.source : item.picture;
                  cleanVideoUrl(mediaUrl, function(cleanedMediaUrl) {
                    if (cleanedMediaUrl) {
                      results.push({
                        mediaurl: cleanedMediaUrl.replace(/s\.jpg$/gi, 'n.jpg'),
                        storyurl:
                            'https://www.facebook.com/permalink.php?story_fbid=' + 
                            item.id.split(/_/)[1] + '&id=' + item.from.id,                      
                        message: cleanMessage(message),
                        user:
                            'https://www.facebook.com/profile.php?id=' +
                            item.from.id,
                        type: item.type,
                        timestamp: timestamp,
                        published: getIsoDateString(timestamp)
                      });
                    }
                    cb(null);
                  });
                });
              },
              function(err) {
                collectResults(results, currentService, pendingRequests);                
              }
            );              
          } else {
            collectResults(results, currentService, pendingRequests);                            
          }
        } catch(e) {
          collectResults(results, currentService, pendingRequests);                                      
        }          
      });
    },
    Twitter: function(pendingRequests) {
      var currentService = 'Twitter';  
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);              
      var params = {
        q: query + ' ' + GLOBAL_config.MEDIA_PLATFORMS.join(' OR ') + ' -"RT "'
      };
      params = querystring.stringify(params);
      var options = {
        url: 'http://search.twitter.com/search.json?' + params,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) { 
        try {
          body = JSON.parse(body);
          var results = [];
          if ((body.results) && (body.results.length)) {
            var items = body.results;
            var itemStack = [];            
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              // extract all URLs form a tweet
              var urls = [];
              text = item.text.replace(GLOBAL_config.URL_REGEX, function(url) {
                var targetURL = (/^\w+\:\//.test(url) ? '' : 'http://') + url;
                urls.push(targetURL);
              });              
              // for each URL prepare the options object
              var optionsStack = [];                    
              for (var j = 0, len2 = urls.length; j < len2; j++) {
                var options = {
                  url: urls[j],
                  followRedirect: false,
                  headers: GLOBAL_config.HEADERS
                };
                optionsStack[j] = options;
              }              
              itemStack[i] = {
                urls: urls,
                options: optionsStack,
                item: item                
              };
            }
            // for each tweet retrieve all URLs and try to expand shortend URLs
            Step(                     
              function() {                            
                var group = this.group();
                itemStack.forEach(function (obj) {
                  obj.options.forEach(function(options) {
                    var cb = group();
                    request.get(options, function(err, reply2) {                                    
                      if (reply2 && reply2.statusCode) {
                        cb(null, {
                          req: {
                            statusCode: reply2.statusCode,
                            location: (reply2.headers.location ?
                                reply2.headers.location : '')
                          },
                          url: options.url
                        });
                      } else {
                        cb(null, {
                          req: {
                            statusCode: 404,
                            location: ''
                          },
                          url: options.url
                        });                      
                      }
                    })
                  });
                });       
              },     
              function(err, replies) { 
                /**
                 * Checks if a URL is one of the media platform URLs
                 */
                function checkForValidUrl(url) {
                  var host = new Uri(url).heirpart().authority().host();
                  return GLOBAL_config.MEDIA_PLATFORMS.indexOf(host) !== -1;
                }
                var locations = [];
                replies.forEach(function(thing, i) {
                  if ((thing.req.statusCode === 301) ||
                      (thing.req.statusCode === 302)) {    
                    if (checkForValidUrl(thing.req.location)) {    
                      locations.push(thing.req.location);
                    } else {
                      locations.push(false);
                    }
                  } else {
                    if (checkForValidUrl(thing.url)) {    
                      locations.push(thing.url);
                    } else {
                      locations.push(false);
                    }
                  }
                });        
                var locationIndex = 0;
                var numberOfUrls = 0;
                var pendingUrls = 0;
                for (var i = 0, len = itemStack.length; i < len; i++) {
                  itemStack[i].urls.forEach(function() {                  
                    numberOfUrls++;
                  });
                }
                for (var i = 0, len = itemStack.length; i < len; i++) {
                  var item = itemStack[i].item;
                  var timestamp = Date.parse(item.created_at);                  
                  var published = getIsoDateString(timestamp)
                  var message = cleanMessage(item.text);
                  var user = 'http://twitter.com/' + item.from_user;
                  itemStack[i].urls.forEach(function() {
                    if (locations[locationIndex]) {
                      var mediaurl = locations[locationIndex];
                      var storyurl = 'http://twitter.com/' +
                          item.from_user + '/status/' + item.id_str;                  
                      // yfrog                                                    
                      if (mediaurl.indexOf('http://yfrog.com') === 0) {
                        var id = mediaurl.replace('http://yfrog.com/', '');
                        var options = {
                          url: 'http://yfrog.com/api/xmlInfo?path=' + id
                        };
                        (function(message, user, timestamp, published) {
                          request.get(options, function(err, result, body) {
                            mediaurl = scrapeYfrog(body);
                            if (mediaurl) {
                              results.push({
                                mediaurl: mediaurl,
                                storyurl: storyurl,
                                message: message,
                                user: user,
                                type: 'photo',
                                timestamp: timestamp,
                                published: published
                              });  
                            }
                            pendingUrls++;           
                            if (pendingUrls === numberOfUrls) {                                                
                              collectResults(
                                  results, currentService, pendingRequests);
                            }
                          });
                        })(message, user, timestamp, published);
                      // TwitPic  
                      } else if (mediaurl.indexOf('http://twitpic.com') === 0) {                        
                        var id = mediaurl.replace('http://twitpic.com/', '');
                        var options = {
                          url: 'http://twitpic.com/' + id + '/full'
                        };
                        (function(message, user, timestamp, published) {                        
                          request.get(options, function(err, res, body) {
                            scrapeTwitPic(body, function(mediaurl) {
                              if (mediaurl) {
                                results.push({
                                  mediaurl: mediaurl,
                                  storyurl: storyurl,
                                  message: message,
                                  user: user,
                                  type: 'photo',
                                  timestamp: timestamp,
                                  published: published
                                });  
                              }
                              pendingUrls++;           
                              if (pendingUrls === numberOfUrls) {                                                
                                collectResults(
                                    results, currentService, pendingRequests);
                              }                              
                            });                            
                          });
                        })(message, user, timestamp, published);    
                      // img.ly                                            
                      } else if (mediaurl.indexOf('http://img.ly') === 0) {                                                                        
                        var id = mediaurl.replace('http://img.ly/', '');
                        var options = {
                          url: 'http://img.ly/' + id
                        };
                        (function(message, user, timestamp, published) {                        
                          request.get(options, function(err, res, body) {
                            scrapeImgLy(body, function(mediaurl) {
                              if (mediaurl) {
                                results.push({
                                  mediaurl: mediaurl,
                                  storyurl: storyurl,
                                  message: message,
                                  user: user,
                                  type: 'photo',
                                  timestamp: timestamp,
                                  published: published
                                });  
                              }
                              pendingUrls++;           
                              if (pendingUrls === numberOfUrls) {                                                
                                collectResults(
                                    results, currentService, pendingRequests);
                              }                              
                            });                            
                          });
                        })(message, user, timestamp, published);                                              
                      // Instagram  
                      } else if (mediaurl.indexOf('http://instagr.am') === 0) {                        
                        var id = mediaurl.replace('http://instagr.am/p/', '');
                        var options = {
                          url: 'https://api.instagram.com/v1/media/' + id + 
                              '?access_token=' + GLOBAL_config.INSTAGRAM_KEY
                        };
                        (function(message, user, timestamp, published) {                        
                          request.get(options, function(err, result, body) {
                            try {
                              body = JSON.parse(body);
                              if ((body.data) && (body.data.images) &&    
                                  (body.data.images.standard_resolution ) &&
                                  (body.data.images.standard_resolution.url)) {
                                results.push({
                                  mediaurl:
                                      body.data.images.standard_resolution.url,
                                  storyurl: storyurl,
                                  message: message,
                                  user: user,
                                  type: 'photo',
                                  timestamp: timestamp,
                                  published: published
                                });                                           
                              }
                            } catch(e) {
                              // noop
                            }
                            pendingUrls++;
                            if (pendingUrls === numberOfUrls) {                                                
                              collectResults(
                                  results, currentService, pendingRequests);
                            }                              
                          });
                        })(message, user, timestamp, published);                                                
                      // URL from unsupported media platform, don't consider it  
                      } else {
                        numberOfUrls--;
                      }
                    } else {
                      numberOfUrls--;
                    }
                    locationIndex++;
                  });
                }                
              }
            );            
          } else {
            collectResults([], currentService, pendingRequests);
          }
        } catch(e) {
          collectResults([], currentService, pendingRequests);          
        }          
      });               
    },
    Instagram: function(pendingRequests) {
      var currentService = 'Instagram';     
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);           
      var params = {
        client_id: GLOBAL_config.INSTAGRAM_KEY
      };
      params = querystring.stringify(params);
      var options = {
        url: 'https://api.instagram.com/v1/tags/' +
            query.replace(/\s*/g, '').replace(/\W*/g, '').toLowerCase() +
            '/media/recent?' + params,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) { 
        try {
          body = JSON.parse(body);
          var results = [];
          if ((body.data) && (body.data.length)) {
            var items = body.data;
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              var timestamp = parseInt(item.created_time + '000', 10);
              var message = '';
              message += (item.caption && item.caption.text ?
                  item.caption.text : '');
              message += (message.length ? '. ' : '') + 
                  (item.tags && Array.isArray(item.tags) ?
                      item.tags.join(', ') : '');
              results.push({
                mediaurl: item.images.standard_resolution.url, 
                storyurl: item.link,
                message: cleanMessage(message),
                user: 'https://api.instagram.com/v1/users/' + item.user.id,
                type: item.type === 'image'? 'photo' : '',
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
        } catch(e) {
          // noop
        }
        collectResults(results, currentService, pendingRequests);
      });
    },    
    YouTube: function(pendingRequests) {
      var currentService = 'YouTube';   
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);             
      var params = {
        v: 2,
        format: 5,
        safeSearch: 'none',
        q: query,
        alt: 'jsonc',
        'max-results': 10,
        'start-index': 1,
        time: 'this_week'        
      };
      params = querystring.stringify(params);
      var options = {
        url: 'http://gdata.youtube.com/feeds/api/videos?' + params,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) {        
        try {
          body = JSON.parse(body);          
          var results = [];
          if ((body.data) && (body.data.items)) {
            var items = body.data.items;
            Step(
              function() {
                var group = this.group();            
                items.forEach(function(item) {
                  if (item.accessControl.embed !== 'allowed') {
                    return;
                  }
                  var cb = group();
                  var timestamp = Date.parse(item.uploaded);
                  var url = item.player.default;
                  cleanVideoUrl(url, function(cleanedVideoUrl) {
                    results.push({
                      mediaurl: cleanedVideoUrl,
                      storyurl: url,
                      message: cleanMessage(
                          item.title + '. ' + item.description),
                      user: 'http://www.youtube.com/' + item.uploader,
                      type: 'video',
                      timestamp: timestamp,
                      published: getIsoDateString(timestamp)
                    });                    
                    cb(null);
                  });
                });
              },
              function(err) {
                collectResults(results, currentService, pendingRequests);                
              }
            );              
          } else {
            collectResults(results, currentService, pendingRequests);                            
          }
        } catch(e) {
          collectResults(results, currentService, pendingRequests);                                      
        }
      });
    },
    FlickrVideos: function(pendingRequests) {
      services.Flickr(pendingRequests, true);
    },
    Flickr: function(pendingRequests, videoSearch) {     
      var currentService = videoSearch ? 'FlickrVideos' : 'Flickr';         
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);       
      var now = new Date().getTime();
      var sixDays = 86400000 * 6;
      var params = {
        method: 'flickr.photos.search',
        api_key: GLOBAL_config.FLICKR_KEY,
        text: query,
        format: 'json',
        nojsoncallback: 1,
        min_taken_date: now - sixDays,
        media: (videoSearch ? 'videos' : 'photos'),
        per_page: 10
      };
      params = querystring.stringify(params);
      var options = {
        url: 'http://api.flickr.com/services/rest/?' + params,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) {        
        try {
          body = JSON.parse(body);
          var results = [];
          if ((body.photos) && (body.photos.photo)) {
            var photos = body.photos.photo;
            Step(     
              function() {              
                var group = this.group();
                for (var i = 0, len = photos.length; i < len; i++) {
                  var photo = photos[i];
                  if (photo.ispublic) {                
                    var params = {
                      method: 'flickr.photos.getInfo',
                      api_key: GLOBAL_config.FLICKR_KEY,
                      format: 'json',
                      nojsoncallback: 1,
                      photo_id: photo.id
                    };
                    params = querystring.stringify(params);
                    var options = {
                      url: 'http://api.flickr.com/services/rest/?' + params,
                      headers: GLOBAL_config.HEADERS
                    };
                    var cb = group();                
                    request.get(options, function(err2, reply2, body2) {        
                      try {
                        body2 = JSON.parse(body2);                
                        var tags = [];
                        if ((body2.photo) &&
                            (body2.photo.tags) && 
                            (body2.photo.tags.tag) &&
                            (Array.isArray(body2.photo.tags.tag))) {
                          body2.photo.tags.tag.forEach(function(tag) {
                            tags.push(tag._content);                          
                          });
                        }
                        var photo2 = body2.photo;
                        var timestamp = Date.parse(photo2.dates.taken);
                        var params = {
                          method: 'flickr.photos.getSizes',
                          api_key: GLOBAL_config.FLICKR_KEY,
                          format: 'json',
                          nojsoncallback: 1,
                          photo_id: photo2.id
                        };
                        params = querystring.stringify(params);
                        var options = {
                          url: 'http://api.flickr.com/services/rest/?' + params,
                          headers: GLOBAL_config.HEADERS
                        };
                        request.get(options, function(err, res2, body) {
                          try {
                            body = JSON.parse(body); 
                            if ((body.sizes) && (body.sizes.size) &&
                                (Array.isArray(body.sizes.size))) {
                              var mediaurl = false;                                
                              body.sizes.size.forEach(function(size) {                              
                                // take the picture in the best-possible
                                // resolution
                                if ((!videoSearch) &&
                                    ((size.label === 'Original') ||
                                     (size.label === 'Large') ||
                                     (size.label === 'Medium 640') ||
                                     (size.label === 'Medium 640') ||
                                     (size.label === 'Medium') ||
                                     (size.label === 'Small') ||
                                     (size.label === 'Thumbnail') ||
                                     (size.label === 'Square'))) {
                                  mediaurl = size.source;
                                }
                                // take the video in the best-possible quality
                                if ((videoSearch) &&
                                    ((size.label === 'Site MP4') ||
                                     (size.label === 'Mobile MP4'))) {
                                  mediaurl = size.source;
                                }
                              });
                              results.push({
                                mediaurl: mediaurl,
                                storyurl: 'http://www.flickr.com/photos/' +
                                    photo2.owner.nsid + '/' + photo2.id + '/',
                                message: cleanMessage(photo2.title._content +
                                    '. ' + photo2.description._content +
                                    tags.join(', ')),
                                user: 'http://www.flickr.com/photos/' +
                                    photo2.owner.nsid + '/',
                                type: (videoSearch ? 'video' : 'photo'),
                                timestamp: timestamp,
                                published: getIsoDateString(timestamp)
                              });
                            }
                            cb();                                                    
                          } catch(e) {
                            cb();                              
                          }
                        });
                      } catch(e) {
                        cb();
                      }                    
                    })
                  }
                }
              },
              function() {
                collectResults(results, currentService, pendingRequests);
              }
            );
          } else {
            collectResults([], currentService, pendingRequests);
          }
        } catch(e) {
          collectResults([], currentService, pendingRequests);
        }
      });
    },
    MobyPicture: function(pendingRequests) {
      var currentService = 'MobyPicture';         
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);       
      var params = {
        key: GLOBAL_config.MOBYPICTURE_KEY,
        action: 'searchPosts',
        format: 'json',
        searchTerms: query
      };
      params = querystring.stringify(params);
      var options = {
        url: 'http://api.mobypicture.com/?' + params,
        headers: GLOBAL_config.HEADERS
      };
      request.get(options, function(err, reply, body) {        
        var results = [];
        try {
          body = JSON.parse(body);          
          if ((body.results) && (body.results.length)) {
            var items = body.results;            
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              var timestamp = item.post.created_on_epoch;
              results.push({
                mediaurl: item.post.media.url_full,
                storyurl: item.post.link,
                message: cleanMessage(
                    item.post.title + '. ' + item.post.description),
                user: item.user.url,
                type: item.post.media.type,
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
          collectResults(results, currentService, pendingRequests);
        } catch(e) {
          collectResults(results, currentService, pendingRequests);
        }
      });
    },
    TwitPic: function(pendingRequests) {   
      var currentService = 'TwitPic';   
      if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);             
      var params = {
        page: 1,
        q: query
      };
      params = querystring.stringify(params);
      var headers = GLOBAL_config.HEADERS;
      headers['X-Requested-With'] = 'XMLHttpRequest';
      var options = {
        url: 'http://twitpic.com/search/show?' + params,
        headers: headers
      };
      request.get(options, function(err, reply, body) {                
        var results = [];
        try {
          body = JSON.parse(body);
          if (body.length) {            
            Step(
              function() {
                var group = this.group();
                for (var i = 0, len = body.length; i < len; i++) {
                  var item = body[i];
                  var id = item.link.replace(/.*?\/(\w+)$/, '$1');
                  var params = {
                    id: id
                  };
                  params = querystring.stringify(params);
                  var options = {
                    url: 'http://api.twitpic.com/2/media/show.json?' + params,
                    headers: GLOBAL_config.HEADERS
                  };
                  var cb = group();                  
                  request.get(options, function(err2, reply2, body2) {        
                    if (body2) {
                      try {
                        body2 = JSON.parse(body2);                  
                      } catch(e) {
                        return cb();
                      }
                    } else {
                      return cb();
                    }
                    if (!body2.errors) {                      
                      var timestamp = Date.parse(body2.timestamp);
                      var options = {
                        url: 'http://twitpic.com/' +
                            body2.short_id + '/full',
                        headers: GLOBAL_config.HEADERS                          
                      };
                      request.get(options, function(err3, res3, body3) {          
                        scrapeTwitPic(body3, function(mediaUrl) {
                          if (mediaUrl) {
                            results.push({
                              mediaurl: mediaUrl,
                              storyurl: 'http://twitpic.com/' +
                                  body2.short_id,
                              message: cleanMessage(body2.message), 
                              user: 'http://twitter.com/' +
                                  (body2.user? body2.user.username : ''),
                              type: 'photo',
                              timestamp: timestamp,
                              published: getIsoDateString(timestamp)
                            });
                          }
                          cb();                            
                        });
                      });
                    } else {
                      cb();
                    }
                  });
                }
              },
              function() {
                collectResults(results, currentService, pendingRequests);
              }
            );
          } else {
            collectResults(results, currentService, pendingRequests);
          }
        } catch(e) {
          collectResults(results, currentService, pendingRequests);          
        }
      });
    }
  };
  if (services[service]) {
    services[service]();
  } 
  if (service === 'combined') {
    var serviceNames = Object.keys(services);
    var pendingRequests = {}
    serviceNames.forEach(function(serviceName) {
      pendingRequests[serviceName] = false;
      services[serviceName](pendingRequests); 
    });

    var length = serviceNames.length;
    var intervalTimeout = 500;
    var timeout = 40 * intervalTimeout;
    var passedTime = 0;
    var interval = setInterval(function() {
      passedTime += intervalTimeout;
      for (var i = 0; i < length; i++) {
        if (passedTime >= timeout) {
          if (GLOBAL_config.DEBUG) console.log('Timeout');    
          break;
        }
        if (pendingRequests[serviceNames[i]] === false) {
          return;
        }
      }
      clearInterval(interval);
      var results = pendingRequests;
      collectResults(results, 'combined', false);
      pendingRequests = {};
    }, intervalTimeout);    
  } 
}

var port = process.env.PORT || 8001;
app.listen(port);
console.log('node.JS running on ' + port);