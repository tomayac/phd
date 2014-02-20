'use strict';

var CLIENT_ID = 'socialmediaillustrator';
var CLIENT_SECRET = 'MX20IfikwigQxBaZuCyrNKEKq18XF/TXZ9D7cqN3oGI=';

/**
 * Translates an array of texts in arbitrary languages to a target language.
 * Usage:
 *   var texts = [
 *     'Je suis français',
 *      'Ich bin deutsch',
 *     'I\'m English'
 *   ];
 *   var toLanguage = 'fr';
 *   translator.multiTranslate(texts, toLanguage, function(err, results) {
 *     console.log(results);
 *   });
 */
var translator = {
  multiTranslate: function multiTranslate(texts, toLanguage, callback) {
    // sanity checks to be within the API limits as published here
    // http://msdn.microsoft.com/en-us/library/ff512422.aspx
    var textsLength = texts.length;
    if (textsLength > 2000) {
      console.log('Warning: translation maximum of 2,000 individual texts exceeded.');
      texts = texts.slice(0, 2000);
    }
    for (var i = 0; i < textsLength; i++) {
      texts[i] = decodeURIComponent(texts[i]).replace(/"/g, '\\"');
      if (texts[i].length > 10000) {
        console.log('Warning: maximum text length of 10,000 characters exceeded at index ' + i + '.');
        texts[i] = texts[i].substring(0, 10000);
      }
      if (texts[i].trim().length === 0) {
        texts[i] = 'N/A';
      }
    }
    // get authentication token
    var translator = new (require('mstranslator'))({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });
    translator.initialize_token(function(keys) {
      var params = {
        texts: texts
      };
      // detect languages
      translator.detectArray(params, function(err, detectedLanguages) {
        if (err) {
          return callback(err);
        }
        var languageOrderedTexts = {};
        for (var i = 0, len = detectedLanguages.length; i < len; i++) {
          var detectedLanguage = detectedLanguages[i];
          if (!languageOrderedTexts[detectedLanguage]) {
            languageOrderedTexts[detectedLanguage] = [];
          }
          languageOrderedTexts[detectedLanguage].push({
            text: texts[i],
            index: i
          });
        }
        var translations = new Array(textsLength);
        var finishedLanguages = 0;
        var languagesToGo = Object.keys(languageOrderedTexts).length;
        for (var language in languageOrderedTexts) {
          // don't translate texts that are already in the desired language
          if (language === toLanguage) {
            languagesToGo--;
            var length = languageOrderedTexts[toLanguage].length;
            for (var j = 0; j < length; j++) {
              var index = languageOrderedTexts[toLanguage][j].index;
              translations[index] = languageOrderedTexts[toLanguage][j].text;
            }
            continue;
          }
          var toBeTranslated = [];
          var length = languageOrderedTexts[language].length;
          for (var j = 0; j < length; j++) {
            toBeTranslated[j] = languageOrderedTexts[language][j].text;
          }
          params = {
            to: toLanguage,
            from: language,
            texts: toBeTranslated
          };
          // translate per detected language
          (function(currentLanguage, currentParams) {
            translator.translateArray(currentParams, function(err,
                translationsArray) {
              if (err) {
                return callback(err);
              }
              finishedLanguages++;
              for (var i = 0, len = translationsArray.length; i < len; i++) {
                var translation = translationsArray[i].TranslatedText;
                var index = languageOrderedTexts[currentLanguage][i].index;
                translations[index] = translation;
              }
              if (finishedLanguages === languagesToGo) {
                callback(null, {
                  texts: texts,
                  translations: translations
                });
              }
            });
          })(language, params);
        }
      });
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = translator;
} else {
  return translator;
}