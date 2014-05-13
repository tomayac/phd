'use strict';

var DEBUG = false;
var querystring = require('querystring');
var http = require('http');

var entityExtractor = {
  extract: function(service, text, callback) {
        /**
     * Merges two entity arrays based on URIs, calculates relevance averages, and
     * maintains provenance information
     */
    var mergeEntities = function(entities1, entities2) {
      if (!entities1 && !entities2) {
        return [];
      } else if (entities1 && !entities2) {
        return entities1;
      } else if (entities2 && !entities1) {
        return entities2;
      }
      var entities = [];
      // entity urls
      for (var i = 0, len1 = entities1.length; i < len1; i++) {
        var entity1 = entities1[i];
        var contained = false;
        for (var j = 0, len2 = entities2.length; j < len2; j++) {
          var entity2 = entities2[j];
          var name1 = entity1.name.toLowerCase();
          var name2 = entity2.name.toLowerCase();
          if (name1 === name2) {
            contained = true;
            var uris1 = entity1.uris;
            var uris2 = entity2.uris;
            for (var k = 0, len3 = uris1.length; k < len3; k++) {
              var uri1 = uris1[k];
              var uriContained = false;
              for (var l = 0, len4 = uris2.length; l < len4; l++) {
                var uri2 = uris2[l];
                if (uri1.uri === uri2.uri) {
                  uriContained = true;
                  break;
                }
              }
              if (!uriContained) {
                uris2.push(uri1);
              }
            }
            entities2.uris = uris2;
            // relevance average
            var relevance1 = entity1.relevance;
            var relevance2 = entity2.relevance;
            entities2[j].relevance = (relevance1 + relevance2) / 2;
            // provenance
            var provenance1 = entity1.source;
            var provenance2 = entity2.source;
            if (provenance1 !== provenance2) {
              entities2[j].source = provenance2 + ',' + provenance1;
            }
          }
        }
        if (!contained) {
          entities.push(entity1);
        }
      }
      entities2 = entities2.concat(entities);
      return entities2;
    };

    // object with all service names
    var services = {
      spotlight: function(pendingRequests) {
        var currentService = 'spotlight';
        // make sure we have at least 25 words
        while (text.split(/\s+/g).length < 25) {
          text = text + ' ' + text;
        }
        var params = {
          confidence: 0.25,
          support: 35,
          text:  text
        };
        params = querystring.stringify(params);
        var options = {
          host: 'spotlight.dbpedia.org',
          port: 80,
          path: '/rest/annotate?' + params,
          headers: {Accept: 'application/json'}
        };
        var entities = [];
        http.get(options, function(res) {
          var response = '';
          res.on('data', function(chunk) {
            response += chunk;
          });
          res.on('end', function() {
            try {
              response = JSON.parse(response);
            } catch(e) {
              sendResults(pendingRequests, entities, currentService);
            }
            if (response.Error || !response.Resources) {
              sendResults(pendingRequests, entities, currentService);
            }
            if (response.Resources) {
              var uris = {};
              for (var i = 0, len = response.Resources.length; i < len; i++) {
                var entity = response.Resources[i];
                // the value of entity['@URI'] is not unique, but we only need it
                // once, we simply don't care about the other occurrences
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
            sendResults(pendingRequests, entities, currentService);
          });
        }).on('error', function(e) {
          sendResults(pendingRequests, entities, currentService);
        });
      },
      zemanta: function(pendingRequests) {
        var currentService = 'zemanta';
        var license = process.env.ZEMANTA_LICENSE;
        var params = {
          method: 'zemanta.suggest_markup',
          api_key:  license,
          text:  text,
          format:  'json',
          return_rdf_links: 1
        };
        params = querystring.stringify(params);
        var options = {
          host: 'papi.zemanta.com',
          method: 'POST',
          port: 80,
          headers: {'Content-Length': params.length},
          path: '/services/rest/0.0/'
        };
        var entities = [];
        var req = http.request(options, function(res) {
          var response = '';
          res.on('data', function(chunk) {
            response += chunk;
          });
          res.on('end', function() {
            try {
              response = JSON.parse(response);
            } catch(e) {
              sendResults(pendingRequests, entities, currentService);
            }
            if (response.markup && response.markup.links) {
              var links = response.markup.links;
              for (var i = 0, len1 = links.length; i < len1; i++) {
                var entity = links[i];
                var uris = [];
                for (var j = 0, len2 = entity.target.length; j < len2; j++) {
                  var target = entity.target[j];
                  if (target.type === 'rdf') {
                    target.url = decodeURIComponent(target.url);
                    uris.push({
                      uri: entity.target[j].url,
                      source: currentService
                    });
                  }
                }
                if (uris.length > 0) {
                  entities.push({
                    name: entity.anchor,
                    relevance: parseFloat(entity.confidence),
                    uris: uris,
                    source: currentService
                  });
                }
              }
            }
            sendResults(pendingRequests, entities, currentService);
          });
        }).on('error', function(e) {
          sendResults(pendingRequests, entities, currentService);
        });
        req.write(params);
        req.end();
      },
      opencalais: function(pendingRequests) {
        var currentService = 'opencalais';
        var license = process.env.OPENCALAIS_LICENSE;
        var paramsXml =
            '<c:params ' +
                'xmlns:c="http://s.opencalais.com/1/pred/" '+
                'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
              '<c:processingDirectives ' +
                  'c:contentType="TEXT/RAW" ' +
                  'c:outputFormat="Application/JSON" ' +
                  'c:calculateRelevanceScore="TRUE" ' +
                  'c:omitOutputtingOriginalText="TRUE" ' +
                  'c:enableMetadataType="SocialTags">' +
              '</c:processingDirectives>' +
              '<c:userDirectives ' +
                  'c:allowDistribution="FALSE" ' +
                  'c:allowSearch="FALSE" ' +
                  'c:externalID="tomayac.com" ' +
                  'c:submitter="Thomas Steiner">' +
              '</c:userDirectives>' +
            '</c:params>';
        var params = {
            licenseID: license,
            content: text.replace(/%/g, '%25'),
            paramsXML: paramsXml
        };
        params = querystring.stringify(params);
        var options = {
          host: 'api.opencalais.com',
          method: 'POST',
          port: 80,
          path: '/enlighten/rest/'
        };
        var entities = [];
        var req = http.request(options, function(res) {
          var response = '';
          res.on('data', function(chunk) {
            response += chunk;
          });
          res.on('end', function() {
            if (response.indexOf('<Error') !== -1) {
              response = {};
            } else {
              try {
                response = JSON.parse(response);
              } catch(e) {
                sendResults(pendingRequests, entities, currentService);
              }
            }
            var keys = typeof(response) === 'object' ? Object.keys(response) : [];
            for (var i = 0, len = keys.length; i < len; i++) {
              var key = keys[i];
              if (key === 'doc') {
                continue;
              } else {
                var entity = response[key];
                if (entity._typeGroup === 'entities') {
                  var name = entity.categoryName ?
                      entity.categoryName :
                      entity.name;
                  entities.push({
                    name: name,
                    relevance: parseFloat(entity.relevance),
                    uris: [{
                      uri: key,
                      source: currentService
                    }],
                    source: currentService
                  });
                }
              }
            }
            sendResults(pendingRequests, entities, currentService);
          });
        }).on('error', function(e) {
          sendResults(pendingRequests, entities, currentService);
        });
        req.setHeader('Content-Length', params.length);
        req.write(params);
        req.end();
      },
      alchemyapi: function(pendingRequests) {
        var currentService = 'alchemyapi';
        var license = process.env.ALCHEMYAPI_LICENSE;
        var params = {
            apikey:  license,
            text:  text,
            outputMode:  'json',
            disambiguate: 1,
            linkedData: 1,
            coreference: 1,
            quotatioms: 1,
            showSourceText: 0
        };
        params = querystring.stringify(params);

        var options1 = {
          host: 'access.alchemyapi.com',
          method: 'POST',
          port: 80,
          path: '/calls/text/TextGetRankedConcepts'
        };

        var entities = [];

        var req1 = http.request(options1, function(res1) {
          var response1 = '';
          res1.on('data', function(chunk) {
            response1 += chunk;
          });
          res1.on('end', function() {

            var options2 = {
              host: 'access.alchemyapi.com',
              method: 'POST',
              port: 80,
              path: '/calls/text/TextGetRankedNamedEntities'
            };

            var req2 = http.request(options2, function(res2) {
              var response2 = '';
              res2.on('data', function(chunk) {
                response2 += chunk;
              });
              res2.on('end', function() {
                var results2;
                try {
                  results2 = JSON.parse(response2);
                } catch(e) {
                  sendResults(pendingRequests, entities, currentService);
                }
                var results1;
                try {
                  results1 = JSON.parse(response1);
                } catch(e) {
                  sendResults(pendingRequests, entities, currentService);
                }
                // copy results2.entities over to results1.entities
                results1.entities = results2.entities ? results2.entities : [];
                // make sure results1.concepts exists
                var concepts = results1.concepts ? results1.concepts : [];
                var entities1 = [];
                for (var i = 0, len1 = concepts.length; i < len1; i++) {
                  var concept = concepts[i];
                  var uris = [];
                  var keys = typeof(concept) === 'object' ?
                      Object.keys(concept) : [];
                  for (var j = 0, len2 = keys.length; j < len2; j++) {
                    var key = keys[j];
                    if ((key === 'text') ||
                        (key === 'relevance') ||
                        (key === 'name') ||
                        (key === 'subType') ||
                        (key === 'website') ||
                        (key === 'geo')) {
                      continue;
                    }
                    concept[key] = decodeURIComponent(concept[key]);
                    uris.push({
                      uri: concept[key],
                      source: currentService
                    });
                  }
                  if (uris.length > 0) {
                    entities1.push({
                      name: concept.text,
                      relevance: parseFloat(concept.relevance),
                      uris: uris,
                      source: currentService
                    });
                  }
                }
                var entities2 = [];
                for (var i = 0, len1 = results1.entities.length; i < len1; i++) {
                  var entity = results1.entities[i];
                  var uris = [];
                  if (!entity.hasOwnProperty('disambiguated')) {
                    continue;
                  }
                  var disambiguated = entity.disambiguated;
                  var keys = typeof(disambiguated) === 'object' ?
                      Object.keys(disambiguated) : [];
                  for (var j = 0, len2 = keys.length; j < len2; j++) {
                    var key = keys[j];
                    if ((key === 'name') ||
                        (key === 'subType') ||
                        (key === 'website') ||
                        (key === 'geo')) {
                      continue;
                    }
                    disambiguated[key] = decodeURIComponent(disambiguated[key]);
                    uris.push({
                      uri: disambiguated[key],
                      source: currentService
                    });
                  }
                  if (uris.length > 0) {
                    entities2.push({
                      name: entity.text,
                      relevance: parseFloat(entity.relevance),
                      uris: uris,
                      source: currentService
                    });
                  }
                }
                entities = mergeEntities(entities1, entities2);
                sendResults(pendingRequests, entities, currentService);
              });
            }).on('error', function(e) {
              sendResults(pendingRequests, entities, currentService);
            });
            req2.setHeader('Content-Length', params.length);
            req2.write(params);
            req2.end();
          });
        }).on('error', function(e) {
          sendResults(pendingRequests, entities, currentService);
        });
        req1.setHeader('Content-Length', params.length);
        req1.write(params);
        req1.end();
      }
    };
    if (services[service]) {
      services[service]();
    }
    if (service === 'combined') {
      var serviceNames = typeof(services) === 'object' ?
          Object.keys(services) : [];
      var pendingRequests = {};
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
            break;
          }
          if (pendingRequests[serviceNames[i]] === false) {
            return;
          }
        }
        clearInterval(interval);
        var results = pendingRequests[serviceNames[0]];
        for (var i = 1 /* 1, yes! */; i < length; i++) {
          results = mergeEntities(results, pendingRequests[serviceNames[i]]);
        }
        sendResults(false, results, 'combined');
        pendingRequests = {};
      }, intervalTimeout);
    }

    function sendResults(pendingRequests, entities, service) {
      if (!pendingRequests) {
        return callback(entities);
      } else {
        pendingRequests[service] = entities;
      }
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = entityExtractor;
} else {
  return entityExtractor;
}