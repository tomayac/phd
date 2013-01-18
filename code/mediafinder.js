var querystring = require('querystring');
var request = require('request');
var jsdom = require('jsdom');
var pos = require('pos');
var Step = require('./step.js');
var Uri = require('./uris.js');

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
  LOCKERZ_KEY: 'f42ed850-c341-46ca-8360-dc47c049b73a',
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
  URL_REGEX: /\b((?:[a-z][\w\-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/ig,
  HASHTAG_REGEX: /(^|\s)\#(\S+)/g,
  USER_REGEX: /(^|\W)\@([a-zA-Z0-9_]+)/g,
  PLUS_REGEX: /(^|\W)\+([a-zA-Z0-9_]+)/g,
  TAG_REGEX: /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
};

var mediaFinder = {
  search: function search(service, query, callback) {

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
     * Core bits adapted from https://github.com/endlesshack/youtube-video
     */
    function cleanVideoUrl(url, callback) {
      var decodeQueryString = function(queryString) {
        var key, keyValPair, keyValPairs, r, val, _i, _len;
        r = {};
        keyValPairs = queryString.split('&');
        for (_i = 0, _len = keyValPairs.length; _i < _len; _i++) {
          keyValPair = keyValPairs[_i];
          key = decodeURIComponent(keyValPair.split('=')[0]);
          val = decodeURIComponent(keyValPair.split('=')[1] || '');
          r[key] = val;
        }
        return r;
      };

      var decodeStreamMap = function(url_encoded_fmt_stream_map) {
        var quality, sources, stream, type, urlEncodedStream, _i, _len, _ref;
        sources = {};
        _ref = url_encoded_fmt_stream_map.split(',');
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          urlEncodedStream = _ref[_i];
          stream = decodeQueryString(urlEncodedStream);
          type = stream.type.split(';')[0];
          quality = stream.quality.split(',')[0];
          stream.original_url = stream.url;
          stream.url = '' + stream.url + '&signature=' + stream.sig;
          sources['' + type + ' ' + quality] = stream;
        }
        return sources;
      };

      // if is YouTube URL
      if ((url.indexOf('http://www.youtube.com') === 0) ||
          (url.indexOf('https://www.youtube.com') === 0)) {
        try {
          var urlObj = new Uri(url);
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
              var keyValue = param.split(/\=/g);
              if (keyValue[0] === 'v') {
                videoId = keyValue[1];
              }
            });
          }
          // Translate to HTML5 video URL, try at least
          var options = {
            url: 'http://www.youtube.com/get_video_info?video_id=' + videoId
          };
          request.get(options, function(err, reply, body) {
            var video;
            video = decodeQueryString(body);
            if (video.status === 'fail') {
              return callback(url);
            }
            video.sources = decodeStreamMap(video.url_encoded_fmt_stream_map);
            video.getSource = function(type, quality) {
              var exact, key, lowest, source, _ref;
              lowest = null;
              exact = null;
              _ref = this.sources;
              for (key in _ref) {
                source = _ref[key];
                if (source.type.match(type)) {
                  if (source.quality.match(quality)) {
                    exact = source;
                  } else {
                    lowest = source;
                  }
                }
              }
              return exact || lowest;
            };
            var webm = video.getSource('video/webm', 'medium');
            var mp4 =  video.getSource('video/mp4', 'medium');
            if (webm) {
              return callback(webm.url);
            } else if (mp4) {
              return callback(mp4.url);
            } else {
              return callback(url);
            }
          });
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
    function replaceHtmlEntities(micropost) {
      micropost = micropost.replace(/&quot;/gi, '\"');
      micropost = micropost.replace(/&apos;/gi, '\'');
      micropost = micropost.replace(/&#39;/gi, '\'');
      micropost = micropost.replace(/&amp;/gi, '&');
      micropost = micropost.replace(/&gt;/gi, '>');
      micropost = micropost.replace(/&lt;/gi, '<');
      return micropost;
    }

    /**
     * Removes line breaks, double spaces, HTML tags, HTML entities, etc.
     */
    function cleanMicropost(micropost) {
      function strip_tags(input, allowed) {
        // http://kevin.vanzonneveld.net
        // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   improved by: Luke Godfrey
        // +      input by: Pul
        // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   bugfixed by: Onno Marsman
        // +      input by: Alex
        // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +      input by: Marc Palau
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +      input by: Brett Zamir (http://brett-zamir.me)
        // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   bugfixed by: Eric Nagel
        // +      input by: Bobby Drake
        // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   bugfixed by: Tomasz Wesolowski
        // +      input by: Evertjan Garretsen
        // +    revised by: Rafał Kukawski (http://blog.kukawski.pl/)
        // *     example 1: strip_tags('<p>Kevin</p> <br /><b>van</b> <i>Zonneveld</i>', '<i><b>');
        // *     returns 1: 'Kevin <b>van</b> <i>Zonneveld</i>'
        // *     example 2: strip_tags('<p>Kevin <img src="someimage.png" onmouseover="someFunction()">van <i>Zonneveld</i></p>', '<p>');
        // *     returns 2: '<p>Kevin van Zonneveld</p>'
        // *     example 3: strip_tags("<a href='http://kevin.vanzonneveld.net'>Kevin van Zonneveld</a>", "<a>");
        // *     returns 3: '<a href='http://kevin.vanzonneveld.net'>Kevin van Zonneveld</a>'
        // *     example 4: strip_tags('1 < 5 5 > 1');
        // *     returns 4: '1 < 5 5 > 1'
        // *     example 5: strip_tags('1 <br/> 1');
        // *     returns 5: '1  1'
        // *     example 6: strip_tags('1 <br/> 1', '<br>');
        // *     returns 6: '1  1'
        // *     example 7: strip_tags('1 <br/> 1', '<br><br/>');
        // *     returns 7: '1 <br/> 1'
        allowed = (((allowed || "") + "").toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join(''); // making sure the allowed arg is a string containing only tags in lowercase (<a><b><c>)
        var tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,
          commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;
        return input.replace(commentsAndPhpTags, '').replace(tags, function($0, $1) {
          return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
        });
      }

      if (micropost) {
        // replace HTML entities
        micropost = replaceHtmlEntities(micropost);
        // remove HTML tags. regular expression stolen from
        var cleanedMicropost = strip_tags(micropost);
        //all regular expressions below stolen from
        // https://raw.github.com/cramforce/streamie/master/public/lib/stream/-
        // streamplugins.js
        //
        // remove urls
        cleanedMicropost = cleanedMicropost.replace(GLOBAL_config.URL_REGEX, ' ');
        // simplify #hashtags to hashtags
        cleanedMicropost = cleanedMicropost.replace(GLOBAL_config.HASHTAG_REGEX, ' $2');
        // simplify @username to username
        cleanedMicropost = cleanedMicropost.replace(GLOBAL_config.USER_REGEX, ' $2');
        // simplify +username to username
        cleanedMicropost = cleanedMicropost.replace(GLOBAL_config.PLUS_REGEX, ' $2');
        // replace line feeds and duplicate spaces
        micropost = micropost.replace(/[\n\r\t]/gi, ' ').replace(/\s+/g, ' ');
        cleanedMicropost = cleanedMicropost.replace(/[\n\r\t]/gi, ' ').replace(/\s+/g, ' ');
        return {
          html: micropost.trim(),
          plainText: cleanedMicropost.trim()
        };
      } else {
        return {
          html: '',
          plainText: ''
        };
      }
    }

    /**
     * Scrapes TwitPic
     */
    function scrapeTwitPic(body, callback) {
      var mediaUrl = false;
      var type = false;
      if (!body) {
        callback(false);
      }
      try {
        jsdom.env(body, function(errors, window) {
          var $ = window.document;
          try {
            if ($.getElementsByTagName('VIDEO').length > 0) {
              mediaUrl = body.substring(body.indexOf('<source src="') +
                  ('<source src="'.length));
              mediaUrl = mediaUrl.substring(0, mediaUrl.indexOf('"'));
              type = 'video';
            } else {
              mediaUrl = $.getElementsByTagName('IMG')[1].src;
              type = 'photo';
            }
            callback(mediaUrl, type);
          } catch(e) {
            if (body.indexOf('error') === -1) {
              throw('ERROR: TwitPic screen scraper broken');
            }
            callback(false);
          }
        });
      } catch(e) {
        callback(false);
      }
    }

    /**
     * Scrapes img.ly
     */
    function scrapeImgLy(body, callback) {
      var mediaUrl = false;
      if (!body) {
        callback(false);
      }
      try {
        jsdom.env(body, function(errors, window) {
          var $ = window.document;
          var match = 'the-image';
          try {
            var image = $.getElementById(match);
            if (image) {
              mediaUrl = image.src;
              callback(mediaUrl);
            } else {
              callback(false);
            }
          } catch(e) {
            throw('ERROR: img.ly screen scraper broken');
          }
        });
      } catch(e) {
        callback(false);
      }
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
      try {
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
      } catch(e) {
        callback({
          caption: false,
          timestamp: false
        });
      }
    }

    /**
     * Annotates microposts with DBpedia Spotlight
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
      var httpMethod = 'POST'; // 'GET';
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
              if ((item.micropost.translation) &&
                  (item.micropost.translation.text) &&
                  (item.micropost.translation.language !== 'en')) {
                // for non-English texts, use the translation if it exists
                text = item.micropost.translation.text;
              } else {
                // use the original version
                text = item.micropost.clean;
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
              item.micropost.entities = collector[serviceName][i];
              // part of speech tagging, PoS
              if (GLOBAL_config.PART_OF_SPEECH) {
                var words;
                if ((item.micropost.translation) &&
                    (item.micropost.translation.text) &&
                    (item.micropost.translation.language !== 'en')) {
                  // for non-English texts, use the translation if it exists
                  words = new pos.Lexer().lex(item.micropost.translation.text);
                } else {
                  words = new pos.Lexer().lex(item.micropost.clean);
                }
                var taggedWords = new pos.POSTagger().tag(words);
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
                  item.micropost.nouns = result;
                }
              }
            });
          });
          sendResults(json);
        }
      );
    }

    /**
     * Translates microposts one by one
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
              var text = item.micropost.clean;
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
              item.micropost.translation = collector[serviceName][i];
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
      io.sockets.emit('mediaResults', {
        service: service
      });
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
      callback(json);
    }

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
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
        request.get(options, function(err, reply, body) {
          var results = [];
          try {
            body = JSON.parse(body);
            if (body.items && Array.isArray(body.items)) {
              body.items.forEach(function(item) {
                // only treat posts, notes, and shares, no check-ins
                if (((item.verb === 'share') || (item.verb === 'post') || (item.verb === 'note')) &&
                    (item.object.attachments) &&
                    (Array.isArray(item.object.attachments))) {
                  item.object.attachments.forEach(function(attachment) {
                    // only treat photos, videos, and articles
                    if ((attachment.objectType !== 'photo') &&
                        (attachment.objectType !== 'video') &&
                        (attachment.objectType !== 'article')) {
                      return;
                    }
                    // the micropost can consist of different parts, dependent on
                    // the item type
                    var micropost = cleanMicropost(
                        (item.object.content ?
                            item.object.content : '') +
                        (item.title ?
                            ' ' + item.title : '') +
                        (item.annotation ?
                            ' ' + item.annotation : '') +
                        (attachment.displayName ?
                            ' ' + attachment.displayName : ''));
                    if (micropost) {
                      var mediaUrl = '';
                      if (attachment.embed) {
                        mediaUrl = attachment.embed.url;
                      } else if (attachment.fullImage) {
                        mediaUrl = attachment.fullImage.url;
                      }
                      cleanVideoUrl(mediaUrl, function(cleanedMediaUrl) {
                        if (cleanedMediaUrl) {
                          results.push({
                            mediaUrl: cleanedMediaUrl,
                            posterUrl: attachment.image.url,
                            micropostUrl: item.url,
                            micropost: micropost,
                            userProfileUrl: item.actor.url,
                            type: attachment.objectType === 'video' ?
                                'video' : 'photo',
                            timestamp: (new Date(item.published)).getTime(),
                            publicationDate: item.published,
                            socialInteractions: {
                              likes: item.object.plusoners.totalItems,
                              shares: item.object.resharers.totalItems,
                              comments: item.object.replies.totalItems,
                              views: null
                            }
                          });
                        }
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
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
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
                    var userProfileUrl = item.profileUrl;
                    var micropostUrl = userProfileUrl + '/photos/' + item.imageId;
                    var mediaUrl = item.thumbnailUrl.replace(/m\.jpg$/, 'l.jpg');
                    var options = {
                      url: micropostUrl,
                      headers: GLOBAL_config.HEADERS
                    };
                    request.get(options, function(err, reply, body) {
                      scrapeMySpace(body, function(scrapeResult) {
                        if (scrapeResult.timestamp && scrapeResult.caption) {
                          results.push({
                            mediaUrl: mediaUrl,
                            posterUrl: null,
                            micropostUrl: micropostUrl,
                            micropost: cleanMicropost(scrapeResult.caption),
                            userProfileUrl: userProfileUrl,
                            type: 'photo',
                            timestamp: scrapeResult.timestamp,
                            publicationDate: getIsoDateString(scrapeResult.timestamp),
                            socialInteractions: {
                              likes: null,
                              shares: null,
                              comments: null,
                              views: null
                            }
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
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
        request.get(options, function(err, reply, body) {
          res.send(body);
        });
      },
      */
      Facebook: function(pendingRequests) {
        var currentService = 'Facebook';
        if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);
        var params = {
          q: query,
          limit: 100,
          fields: 'comments,type,created_time,name,caption,description,source,picture,id,from,likes,shares'
        };
        params = querystring.stringify(params);
        var options = {
          url: 'https://graph.facebook.com/search?' + params + '&type=post',
          headers: GLOBAL_config.HEADERS
        };
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
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
                    var micropost = '';
                    micropost += (item.name ? item.name : '');
                    micropost += (item.caption ?
                        (micropost.length ? '. ' : '') + item.caption : '');
                    micropost += (item.description ?
                        (micropost.length ? '. ' : '') + item.description : '');
                    micropost += (item.micropost ?
                        (micropost.length ? '. ' : '') + item.micropost : '');
                    var mediaUrl = item.type === 'video' ?
                        item.source : item.picture;
                    cleanVideoUrl(mediaUrl, function(cleanedMediaUrl) {
                      if (cleanedMediaUrl) {
                        results.push({
                          mediaUrl: cleanedMediaUrl.replace(/s\.jpg$/gi, 'n.jpg'),
                          posterUrl: item.picture,
                          micropostUrl:
                              'https://www.facebook.com/permalink.php?story_fbid=' +
                              item.id.split(/_/)[1] + '&id=' + item.from.id,
                          micropost: cleanMicropost(micropost),
                          userProfileUrl:
                              'https://www.facebook.com/profile.php?id=' +
                              item.from.id,
                          type: item.type,
                          timestamp: timestamp,
                          publicationDate: getIsoDateString(timestamp),
                          socialInteractions: {
                            likes: item.likes ? item.likes.count : null,
                            shares: item.shares ? item.shares.count : null,
                            comments: item.comments ? item.comments.count : null,
                            views: null
                          }
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
      TwitterNative: function(pendingRequests) {
        var currentService = 'TwitterNative';
        if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);
        var params = {
          q: query + ' -"RT "',
          result_type: 'recent',
          include_entities: true,
          rpp: 100
        };
        params = querystring.stringify(params);
        var options = {
          url: 'http://search.twitter.com/search.json?' + params,
          headers: GLOBAL_config.HEADERS
        };
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
        request.get(options, function(err, reply, body) {
          try {
            body = JSON.parse(body);
            var results = [];
            if ((body.results) && (body.results.length)) {
              var items = body.results;
              Step(
                function() {
                  var group = this.group();
                  for (var i = 0, len = items.length; i < len; i++) {
                    var cb = group();
                    (function(item) {
                    var mediaUrl = '';
                    if (item.entities && item.entities.media &&
                        item.entities.media.length > 0) {
                      mediaUrl = item.entities.media[0].media_url ?
                          item.entities.media[0].media_url :
                          item.entities.media[0].media_url_https;
                      params = {
                        id: item.id_str,
                        trim_user: true
                      };
                      params = querystring.stringify(params);
                      var options = {
                        url: 'https://api.twitter.com/1/statuses/show.json?' + params,
                        headers: GLOBAL_config.HEADERS
                      };
                      request.get(options, function(err, reply, body2) {
                        try {
                          body2 = JSON.parse(body2);
                          var timestamp = Date.parse(item.created_at);
                          var publicationDate = getIsoDateString(timestamp);
                          var micropost = cleanMicropost(item.text);
                          var userProfileUrl = 'http://twitter.com/' + item.from_user;
                          var micropostUrl = 'http://twitter.com/' +
                              item.from_user + '/status/' + item.id_str;
                          results.push({
                            mediaUrl: mediaUrl,
                            posterUrl: mediaUrl + ':thumb',
                            micropostUrl: micropostUrl,
                            micropost: micropost,
                            userProfileUrl: userProfileUrl,
                            type: 'photo',
                            timestamp: timestamp,
                            publicationDate: publicationDate,
                            socialInteractions: {
                              likes: null,
                              shares: body2.retweet_count ? body2.retweet_count : 0,
                              comments: null,
                              views: null
                            }
                          });
                          cb();
                        } catch(e) {
                          cb();
                        }
                      });
                    } else {
                      cb();
                    }
                    })(items[i]);
                  }
                },
                function() {
                  collectResults(results, currentService, pendingRequests);
                }
              );
            }
          } catch(e) {
            collectResults([], currentService, pendingRequests);
          }
        });
      },
      Twitter: function(pendingRequests) {
        var currentService = 'Twitter';
        if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);
        var params = {
          q: query + ' ' + GLOBAL_config.MEDIA_PLATFORMS.join(' OR ') + ' -"RT "',
          rpp: 100,
          result_type: 'recent'
        };
        params = querystring.stringify(params);
        var options = {
          url: 'http://search.twitter.com/search.json?' + params,
          headers: GLOBAL_config.HEADERS
        };
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
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
                item.text.replace(GLOBAL_config.URL_REGEX, function(url) {
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
                      });
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
                  var i;
                  var len;
                  for (i = 0, len = itemStack.length; i < len; i++) {
                    itemStack[i].urls.forEach(function() {
                      numberOfUrls++;
                    });
                  }
                  for (i = 0, len = itemStack.length; i < len; i++) {
                    var item = itemStack[i].item;
                    var timestamp = Date.parse(item.created_at);
                    var publicationDate = getIsoDateString(timestamp);
                    var micropost = cleanMicropost(item.text);
                    var userProfileUrl = 'http://twitter.com/' + item.from_user;
                    itemStack[i].urls.forEach(function() {
                      if (locations[locationIndex]) {
                        var mediaUrl = locations[locationIndex];
                        var micropostUrl = 'http://twitter.com/' +
                            item.from_user + '/status/' + item.id_str;
                        // yfrog
                        if (mediaUrl.indexOf('http://yfrog.com') === 0) {
                          var id = mediaUrl.replace('http://yfrog.com/', '');
                          var options = {
                            url: 'http://yfrog.com/api/xmlInfo?path=' + id
                          };
                          (function(micropost, userProfileUrl, timestamp, publicationDate) {
                            request.get(options, function(err, result, body) {
                              if (mediaUrl) {
                                results.push({
                                  mediaUrl: mediaUrl + ':iphone',
                                  posterUrl: mediaUrl + ':small',
                                  micropostUrl: micropostUrl,
                                  micropost: micropost,
                                  userProfileUrl: userProfileUrl,
                                  type: 'photo',
                                  timestamp: timestamp,
                                  publicationDate: publicationDate,
                                  socialInteractions: {
                                    likes: null,
                                    shares: null,
                                    comments: null,
                                    views: null
                                  }
                                });
                              }
                              pendingUrls++;
                              if (pendingUrls === numberOfUrls) {
                                collectResults(
                                    results, currentService, pendingRequests);
                              }
                            });
                          })(micropost, userProfileUrl, timestamp, publicationDate);
                        // TwitPic
                        } else if (mediaUrl.indexOf('http://twitpic.com') === 0) {
                          var id = mediaUrl.replace('http://twitpic.com/', '');
                          var options = {
                            url: 'http://twitpic.com/' + id + '/full'
                          };
                          (function(micropost, userProfileUrl, timestamp, publicationDate) {
                            request.get(options, function(err, res, body) {
                              scrapeTwitPic(body, function(mediaUrl, type) {
                                if (mediaUrl) {
                                  results.push({
                                    mediaUrl: mediaUrl,
                                    posterUrl: mediaUrl,
                                    micropostUrl: micropostUrl,
                                    micropost: micropost,
                                    userProfileUrl: userProfileUrl,
                                    type: type,
                                    timestamp: timestamp,
                                    publicationDate: publicationDate,
                                    socialInteractions: {
                                      likes: null,
                                      shares: null,
                                      comments: null,
                                      views: null
                                    }
                                  });
                                }
                                pendingUrls++;
                                if (pendingUrls === numberOfUrls) {
                                  collectResults(
                                      results, currentService, pendingRequests);
                                }
                              });
                            });
                          })(micropost, userProfileUrl, timestamp, publicationDate);
                        // img.ly
                        } else if (mediaUrl.indexOf('http://img.ly') === 0) {
                          var id = mediaUrl.replace('http://img.ly/', '');
                          var options = {
                            url: 'http://img.ly/' + id
                          };
                          (function(micropost, userProfileUrl, timestamp, publicationDate) {
                            request.get(options, function(err, res, body) {
                              scrapeImgLy(body, function(mediaUrl) {
                                if (mediaUrl) {
                                  results.push({
                                    mediaUrl: mediaUrl,
                                    posterUrl: mediaUrl,
                                    micropostUrl: micropostUrl,
                                    micropost: micropost,
                                    userProfileUrl: userProfileUrl,
                                    type: 'photo',
                                    timestamp: timestamp,
                                    publicationDate: publicationDate,
                                    socialInteractions: {
                                      likes: null,
                                      shares: null,
                                      comments: null,
                                      views: null
                                    }
                                  });
                                }
                                pendingUrls++;
                                if (pendingUrls === numberOfUrls) {
                                  collectResults(
                                      results, currentService, pendingRequests);
                                }
                              });
                            });
                          })(micropost, userProfileUrl, timestamp, publicationDate);
                        // Instagram
                        } else if (mediaUrl.indexOf('http://instagr.am') === 0) {
                          var id = mediaUrl.replace('http://instagr.am/p/', '');
                          var options = {
                            url: 'https://api.instagram.com/v1/media/' + id +
                                '?access_token=' + GLOBAL_config.INSTAGRAM_KEY
                          };
                          (function(micropost, userProfileUrl, timestamp, publicationDate) {
                            request.get(options, function(err, result, body) {
                              try {
                                body = JSON.parse(body);
                                if ((body.data) && (body.data.images) &&
                                    (body.data.images.standard_resolution ) &&
                                    (body.data.images.standard_resolution.url)) {
                                  results.push({
                                    mediaUrl:
                                        body.data.images.standard_resolution.url,
                                    posterUrl: body.data.images.thumbnail.url,
                                    micropostUrl: micropostUrl,
                                    micropost: micropost,
                                    userProfileUrl: userProfileUrl,
                                    type: 'photo',
                                    timestamp: timestamp,
                                    publicationDate: publicationDate,
                                    socialInteractions: {
                                      likes: null,
                                      shares: null,
                                      comments: null,
                                      views: null
                                    }
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
                          })(micropost, userProfileUrl, timestamp, publicationDate);
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
        var results = [];
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
        request.get(options, function(err, reply, body) {
          try {
            body = JSON.parse(body);
            if ((body.data) && (body.data.length)) {
              var items = body.data;
              for (var i = 0, len = items.length; i < len; i++) {
                var item = items[i];
                var timestamp = parseInt(item.created_time + '000', 10);
                var micropost = '';
                micropost += (item.caption && item.caption.text ?
                    item.caption.text : '');
                micropost += (micropost.length ? '. ' : '') +
                    (item.tags && Array.isArray(item.tags) ?
                        item.tags.join(', ') : '');
                results.push({
                  mediaUrl: item.images.standard_resolution.url,
                  posterUrl: item.images.thumbnail.url,
                  micropostUrl: item.link,
                  micropost: cleanMicropost(micropost),
                  userProfileUrl: 'https://api.instagram.com/v1/users/' + item.user.id,
                  type: item.type === 'image'? 'photo' : '',
                  timestamp: timestamp,
                  publicationDate: getIsoDateString(timestamp),
                  socialInteractions: {
                    likes: item.likes.count,
                    shares: null,
                    comments: item.comments.count,
                    views: null
                  }
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
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
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
                        mediaUrl: cleanedVideoUrl,
                        posterUrl: item.thumbnail.sqDefault,
                        micropostUrl: url,
                        micropost: cleanMicropost(
                            item.title + '. ' + item.description),
                        userProfileUrl: 'http://www.youtube.com/' + item.uploader,
                        type: 'video',
                        timestamp: timestamp,
                        publicationDate: getIsoDateString(timestamp),
                        socialInteractions: {
                          likes: (parseInt((item.likeCount ?
                              item.likeCount : 0), 10) +
                              parseInt((item.favoriteCount ?
                              item.favoriteCount : 0), 10)),
                          shares: null,
                          comments: parseInt((item.commentCount ?
                              item.commentCount : 0), 10),
                          views: parseInt((item.viewCount ?
                              item.viewCount : 0), 10)
                        }
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
        var now = ~~(new Date().getTime() / 1000);
        var sixDays = 86400 * 6;
        var params = {
          method: 'flickr.photos.search',
          api_key: GLOBAL_config.FLICKR_KEY,
          text: query,
          format: 'json',
          nojsoncallback: 1,
          min_taken_date: now - sixDays,
          media: (videoSearch ? 'videos' : 'photos'),
          per_page: 20
        };
        params = querystring.stringify(params);
        var options = {
          url: 'http://api.flickr.com/services/rest/?' + params,
          headers: GLOBAL_config.HEADERS
        };
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
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
                                var mediaUrl = false;
                                var posterUrl = false;
                                body.sizes.size.forEach(function(size) {
                                  // take the picture in the best-possible
                                  // resolution, the highest resolution (unknown)
                                  // is always the last in the sizes array
                                  if ((!videoSearch) &&
                                      ((size.label === 'Original') ||
                                       (size.label === 'Large') ||
                                       (size.label === 'Medium 640') ||
                                       (size.label === 'Medium 640') ||
                                       (size.label === 'Medium') ||
                                       (size.label === 'Small') ||
                                       (size.label === 'Thumbnail') ||
                                       (size.label === 'Square'))) {
                                    mediaUrl = size.source;
                                  }
                                  if (size.label === 'Thumbnail') {
                                    posterUrl = size.source;
                                  }
                                  // take the video in the best-possible quality
                                  if ((videoSearch) &&
                                      ((size.label === 'Site MP4') ||
                                       (size.label === 'Mobile MP4'))) {
                                    mediaUrl = size.source;
                                  }
                                });
                                var params = {
                                  method: 'flickr.photos.getFavorites',
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
                                    results.push({
                                      mediaUrl: mediaUrl,
                                      posterUrl: posterUrl,
                                      micropostUrl: 'http://www.flickr.com/photos/' +
                                          photo2.owner.nsid + '/' + photo2.id + '/',
                                      micropost: cleanMicropost(photo2.title._content +
                                          '. ' + photo2.description._content +
                                          tags.join(', ')),
                                      userProfileUrl: 'http://www.flickr.com/photos/' +
                                          photo2.owner.nsid + '/',
                                      type: (videoSearch ? 'video' : 'photo'),
                                      timestamp: timestamp,
                                      publicationDate: getIsoDateString(timestamp),
                                      socialInteractions: {
                                        likes: parseInt(body.photo.total, 10),
                                        shares: null,
                                        comments: parseInt(photo2.comments._content, 10),
                                        views: parseInt(photo2.views, 10)
                                      }
                                    });
                                    cb();
                                  } catch(e) {
                                    cb();
                                  }
                                });
                              }
                            } catch(e) {
                              cb();
                            }
                          });
                        } catch(e) {
                          cb();
                        }
                      });
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
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
        request.get(options, function(err, reply, body1) {
          var results = [];
          try {
            body1 = JSON.parse(body1);
            if ((body1.results) && (body1.results.length)) {
              var items = body1.results;
              Step(
                function() {
                  var group = this.group();
                  for (var i = 0, len = items.length; i < len; i++) {
                    var cb = group();
                    var item = items[i];
                    params = {
                      key: GLOBAL_config.MOBYPICTURE_KEY,
                      action: 'getMediaInfo',
                      format: 'json',
                      tinyurl_code: item.post.link_tiny
                    };
                    params = querystring.stringify(params);
                    options = {
                      url: 'http://api.mobypicture.com/?' + params,
                      headers: GLOBAL_config.HEADERS
                    };
                    request.get(options, function(err, reply, body2) {
                      try {
                        body2 = JSON.parse(body2);
                        var mediaUrl = body2.post.media.url_full;
                        var posterUrl = body2.post.media.url_thumbnail;
                        var micropostUrl = body2.post.link;
                        var timestamp = body2.post.created_on_epoch * 1000;
                        var micropost = body2.post.title + '. ' + item.post.description;
                        var userProfileUrl = body2.user.url;
                        var type = body2.post.media.type;
                        var views = parseInt(body2.post.views, 10);
                        var comments = parseInt(body2.post.comments, 10);
                        params = {
                          key: GLOBAL_config.MOBYPICTURE_KEY,
                          action: 'getLikes',
                          format: 'json',
                          tinyurl_code: body2.post.link_tiny
                        };
                        params = querystring.stringify(params);
                        options = {
                          url: 'http://api.mobypicture.com/?' + params,
                          headers: GLOBAL_config.HEADERS
                        };
                        request.get(options, function(err, reply, body3) {
                          try {
                            body3 = JSON.parse(body3);
                            results.push({
                              mediaUrl: mediaUrl,
                              posterUrl: posterUrl,
                              micropostUrl: micropostUrl,
                              micropost: cleanMicropost(
                                  micropost),
                              userProfileUrl: userProfileUrl,
                              type: type,
                              timestamp: timestamp,
                              publicationDate: getIsoDateString(timestamp),
                              socialInteractions: {
                                likes: parseInt(body3.votes, 10),
                                shares: null,
                                comments: comments,
                                views: views
                              }
                            });
                            cb();
                          } catch(e) {
                            cb();
                          }
                        });
                      } catch(e) {
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
      },
      TwitPic: function(pendingRequests) {
        var currentService = 'TwitPic';
        if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);
        var params = {
          tag: query
        };
        params = querystring.stringify(params);
        var headers = GLOBAL_config.HEADERS;
        var options = {
          url: 'http://api.twitpic.com/2/tags/show.json?' + params,
          headers: headers
        };
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
        request.get(options, function(err, reply, body) {
          var results = [];
          try {
            body = JSON.parse(body);
            if (body.images && body.images.length > 0) {
              Step(
                function() {
                  var group = this.group();
                  for (var i = 0, len = body.images.length; i < len; i++) {
                    (function(image) {
                      var userProfileUrl = 'http://twitpic.com/photos/' + image.user.username;
                      var micropost = image.message;
                      var timestamp = (new Date(image.timestamp)).getTime();
                      var publicationDate = getIsoDateString(timestamp);
                      var micropostUrl = 'http://twitpic.com/' + image.short_id;
                      var views = parseInt(image.views, 10);
                      var comments = parseInt(image.number_of_comments, 10);
                      var cb = group();
                      request.get(micropostUrl + '/full', function(err2, reply2, body2) {
                        scrapeTwitPic(body2, function(mediaUrl, type) {
                          results.push({
                            mediaUrl: mediaUrl,
                            posterUrl: 'http://twitpic.com/show/thumb/' + micropostUrl.replace('http://twitpic.com/', ''),
                            micropostUrl: micropostUrl,
                            micropost: cleanMicropost(micropost),
                            userProfileUrl: userProfileUrl,
                            type: type,
                            timestamp: timestamp,
                            publicationDate: publicationDate,
                            socialInteractions: {
                              likes: null,
                              shares: null,
                              comments: comments,
                              views: views
                            }
                          });
                          cb();
                        });
                      });
                    })(body.images[i]);
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
      },
      Lockerz: function(pendingRequests) {
        var currentService = 'Lockerz';
        if (GLOBAL_config.DEBUG) console.log(currentService + ' *** ' + query);
        var params = {
          search: query
        };
        params = querystring.stringify(params);
        var headers = GLOBAL_config.HEADERS;
        var options = {
          url: 'http://api.plixi.com/api/tpapi.svc/json/photos?' + params,
          headers: headers
        };
        if (GLOBAL_config.DEBUG) console.log(currentService + ' ' + options.url);
        request.get(options, function(err, reply, body) {
          var results = [];
          try {
            body = JSON.parse(body);
            if (body.List) {
              body.List.forEach(function(item) {
                results.push({
                  mediaUrl: item.BigImageUrl,
                  posterUrl: item.ThumbnailUrl,
                  micropostUrl: 'http://lockerz.com/s/' + item.TinyAlias,
                  micropost: cleanMicropost(item.Message),
                  userProfileUrl: 'http://pics.lockerz.com/gallery/' + item.UserId,
                  type: 'photo',
                  timestamp: item.UploadDate * 1000,
                  publicationDate: new Date(item.UploadDate * 1000),
                  socialInteractions: {
                    likes: item.LikedVotes,
                    shares: item.Grabs,
                    comments: item.CommentCount,
                    views: item.Views
                  }
                });
              });
            }
            collectResults(results, currentService, pendingRequests);
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
      var pendingRequests = {};
      serviceNames.forEach(function(serviceName) {
        pendingRequests[serviceName] = false;
        services[serviceName](pendingRequests);
      });

      var length = serviceNames.length;
      var intervalTimeout = 500;
      var timeout = 60 * intervalTimeout;
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
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mediaFinder;
} else {
  return mediaFinder;
}
