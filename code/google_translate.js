'use strict';

var async = require('async');
var request = require('request');

var BASE_URL = 'https://translate.google.com/translate_a/t?client=t';

function translate(text, fromLanguage, toLanguage, callback) {
  var options = {/*
    headers: {
      'accept': '',
      'accept-encoding': 'gzip,deflate,sdch',
      'accept-language': 'en-US,en;q=0.8,de;q=0.6',
      'origin': 'https://translate.google.com',
      'referer': 'https://translate.google.com/?vi=c',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/34.0.1847.131 Safari/537.36'
    },*/
    form: {
      q: text
    },
    url: BASE_URL + '&sl=' + fromLanguage + '&tl=' + toLanguage +
        '&hl=en&ie=UTF-8&oe=UTF-8&uptl=en&pc=1&oc=1&otf=1&ssel=0&tsel=0'
  };
  request.post(options, function(error, response, body) {
    if (error || response.statusCode !== 200) {
      return callback(err || response.statusCode);
    }
    try {
      var array = eval(body);
      var translatedText = array[0][0][0];
      return callback(null, translatedText);
    } catch(e) {
      callback(e);
    }
  });
}

function translateTexts(texts, fromLanguage, toLanguage, callback) {
  var functions = [];
  texts.forEach(function(text, i) {
    functions[i] = function(callback) {
      translate(text, fromLanguage, toLanguage, callback);
    };
  });
  async.series(
    functions,
    function(err, results) {
      if (err) {
        callback(err);
      }
      callback(null, results);
    }
  );
}

module.exports = {
  translateTexts: translateTexts
};