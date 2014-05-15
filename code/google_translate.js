'use strict';

var async = require('async');
var request = require('request');

var BASE_URL = 'https://translate.google.com/translate_a/t?client=t';

function translate(text, fromLanguage, toLanguage, callback) {
  var options = {
    form: {
      q: text
    },
    url: BASE_URL + '&sl=' + fromLanguage + '&tl=' + toLanguage +
        '&hl=en&ie=UTF-8&oe=UTF-8&uptl=en&pc=1&oc=1&otf=1&ssel=0&tsel=0'
  };
  request.post(options, function(error, response, body) {
    if (error || response.statusCode !== 200) {
      return callback(error || response.statusCode);
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

function translateTexts(texts, fromLanguage, toLanguage, mainCallback) {
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
        return mainCallback(err);
      }
      mainCallback(null, results);
    }
  );
}

module.exports = {
  translateTexts: translateTexts
};