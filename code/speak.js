var speakjs = require('node-speak');
var speak = {
  say: function say(words, callback) {
    speakjs(words, {
      amplitude: 150, // How loud the voice will be (default: 100)
      pitch: 1, // The voice pitch (default: 50)
      speed: 180, // The speed at which to talk (words per minute) (default: 175)
      wordgap: 0, //Additional gap between words in 10 ms units (default: 0)
      callback: callback
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = speak;
} else {
  return speak;
}