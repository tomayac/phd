/*!
 * jsPOS
 *
 * Copyright 2010, Percy Wegmann
 * Licensed under the GNU LGPLv3 license
 * http://www.opensource.org/licenses/lgpl-3.0.html
 */

var LexerNode = function(string, regex, regexs) {
	this.string = string;
  this.children = [];
	if (string) {
		this.matches = string.match(regex);
		var childElements = string.split(regex);
	}
	if (!this.matches) {
		this.matches = [];
		var childElements = [string];
	}
	if (regexs.length > 0) {
    var nextRegex = regexs[0];
		var nextRegexes = regexs.slice(1);
		for (var i = 0, len = childElements.length; i < len; i++) {
			this.children.push(
			    new LexerNode(childElements[i], nextRegex, nextRegexes));
    }
  } else {
    this.children = childElements;
  }
}

LexerNode.prototype.fillArray = function(array) {
  for (var i = 0, len = this.children.length; i < len; i++) {
    var child = this.children[i];
    if (child.fillArray) {
      child.fillArray(array);
    } else if (/[^\s\t\n\r]+/i.test(child)) {
      array.push(child);
    }
    if (i < this.matches.length) {
			var match = this.matches[i];
			if (/[^\s\t\n\r]+/i.test(match)) {
        array.push(match);
      }
    }
  }
}

LexerNode.prototype.toString = function(){
  var array = [];
  this.fillArray(array);
  return array.toString();
}

var Lexer = function (){
	// Split by numbers, then whitespace, then punctuation
  this.regexs = [
    /[0-9]*[\.\,][0-9]+|[0-9]+/ig,
    /[\s\t\n\r]+/ig,
    /[\.\,\?\!\;\:\'\`\´\…]/ig
  ];
}

Lexer.prototype.lex = function(string){
  // doesn't => does not
  string = string.replace(/n[\'\`\´]t/g, ' not');
  // i'm => i am
  string = string.replace(/\bi[\'\`\´]m\b/gi, 'I am');
  // 've => have
  string = string.replace(/[\'\´\`]ve\b/gi, ' have');  
  // ... => …
  string = string.replace(/\.\.\./gi, '…');
	var array = [];
  var node = new LexerNode(string, this.regexs[0], this.regexs.slice(1));
  node.fillArray(array);
  return array;
}

module.exports = Lexer;