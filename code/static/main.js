(function() {
  var illustrator = {
    DEBUG: true,
    MEDIA_SERVER: 'http://localhost:8001/search/',
    PROXY_SERVER: 'http://localhost:8001/proxy/',
    THRESHOLD: 10,
    ACCOUNT_FOR_LUMINANCE: true,
    BW_TOLERANCE: 1,
    COLS: 10,
    ROWS: 10,
    SIMILAR_TILES: 0,
    SIMILAR_TILES_FACTOR: 0.8,
    CONSIDER_FACES: true,
    images: {},
    mediaItems: {},
    mediaItemUrls: {},
    statuses: {},
    distances: {},
    origins: {},
    clusters: {},
    tileHistograms: {},
    faces: {},
    socket: null,
    canvas: null,
    ctx: null,
    // checks if all media items are of the given status
    checkMediaItemStatuses: function(status) {
      for (var key in illustrator.statuses) {
        if (illustrator.statuses[key] !== status) {
          return false;
        }
      }
      return true;
    },
    calculateSimilarTiles: function() {
      return Math.ceil(illustrator.ROWS * illustrator.COLS *
          illustrator.SIMILAR_TILES_FACTOR);
    },
    calculateMinimumSimilarTiles: function() {
      return Math.ceil(illustrator.ROWS * illustrator.COLS / 2);
    },
    /**
     * Initialzes the application
     */
    init: function() {
      illustrator.socket = io.connect('http://localhost:8001/');
      illustrator.initSockets();

      illustrator.canvas = document.createElement('canvas');
      illustrator.canvas.width = 100;
      illustrator.canvas.height = 100;
      illustrator.ctx = illustrator.canvas.getContext('2d');

      if (illustrator.DEBUG) console.log('init');
      illustrator.reset();

      var resultsDiv = document.getElementById('results');

      var firstImage = null;
      var secondImage = null;

      // left click selects the left comparison image
      resultsDiv.addEventListener('click', function(e) {
        if (e.target.nodeName.toLowerCase() !== 'img') {
          return;
        };
        var img = e.target;
        firstImage = img.src;
        drawDebugCanvas(img);
      });

      // right click selects the right comparison image
      resultsDiv.addEventListener('contextmenu', function(e) {
        if (e.target.nodeName.toLowerCase() !== 'img') {
          return;
        };
        var img = e.target;
        secondImage = img.src;
        drawDebugCanvas(img);

        if (firstImage && secondImage) {
          var distance = illustrator.distances[firstImage][secondImage];
          var similarTiles = 0;
          var nulls = 0;
          for (var k in distance) {
            if (distance[k] !== null) {
              if (distance[k] <= illustrator.THRESHOLD) {
                similarTiles++;
              }
            } else {
              nulls++;
            }
          }
          var minimumRequired;
          var minimumSimilarTiles = illustrator.calculateMinimumSimilarTiles();
          if (illustrator.SIMILAR_TILES - nulls >= minimumSimilarTiles) {
            minimumRequired = illustrator.SIMILAR_TILES - nulls;
          } else {
            minimumRequired = minimumSimilarTiles;
          }
          console.log('Similar tiles: ' + similarTiles +
              '\nMinimum required: ' + minimumRequired +
              '\nOverall: ' + (illustrator.COLS * illustrator.ROWS) +
              '\nNulls: ' + nulls +
              '\nPercent: ' +
              ((similarTiles / (illustrator.COLS * illustrator.ROWS)) * 100) +
              '%\n------------');
          if (similarTiles >= minimumRequired) {
            if (illustrator.CONSIDER_FACES) {
              var outerFaces = illustrator.faces[firstImage].length;
              var innerFaces = illustrator.faces[secondImage].length;
              if (innerFaces === outerFaces) {
                console.log('Detected faces: ' + innerFaces + '\n------------');
              }
            }
          }
        }
      });

      var drawDebugCanvas = function drawDebugCanvas(img) {
        var src = img.src;
        var canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        canvas.style.marginLeft = img.style.marginLeft;
        canvas.style.border = 'solid green 2px';
        canvas.setAttribute('class', 'photo');
        var ctx = canvas.getContext('2d');

        // calculate the histograms tile-wise
        var sw = ~~(img.width / illustrator.COLS);
        var sh = ~~(img.height / illustrator.ROWS);
        var dw = ~~(canvas.width / illustrator.COLS);
        var dh = ~~(canvas.height / illustrator.ROWS);

        var histo = illustrator.tileHistograms[src];
        img.parentNode.replaceChild(canvas, img);
        for (var tile in histo) {
          var mod = (tile % illustrator.COLS);
          var div = ~~(tile / illustrator.COLS);
          var sx = mod * sw;
          var sy = div * sh;
          var dx = mod * dw;
          var dy = div * dh;
          ctx.fillStyle = 'rgb(' + histo[tile].r + ',' + histo[tile].g + ',' +
              histo[tile].b + ')';
          ctx.fillRect(dx, dy, dw, dh);
        }

        canvas.addEventListener('click', function() {
          canvas.parentNode.replaceChild(img, canvas);
        });
      };

      var faces = document.getElementById('faces');
      faces.checked = illustrator.CONSIDER_FACES;
      faces.addEventListener('change', function() {
        illustrator.CONSIDER_FACES = faces.checked;
        illustrator.clusters = {};
        if (illustrator.DEBUG) console.log('sort');
        illustrator.sort();
      });

      var luminance = document.getElementById('luminance');
      luminance.checked = illustrator.ACCOUNT_FOR_LUMINANCE;
      luminance.addEventListener('change', function() {
        illustrator.ACCOUNT_FOR_LUMINANCE = luminance.checked;
        illustrator.clusters = {};
        illustrator.distances = {};
        illustrator.calculateDistances();
      });

      var rows = document.getElementById('rows');
      rows.value = illustrator.ROWS;
      rows.max = 50;
      rows.min = 1;
      var rowsLabel = document.getElementById('rowsLabel');
      rowsLabel.innerHTML = rows.value;
      rows.addEventListener('change', function() {
        rowsLabel.innerHTML = rows.value;
      });
      rows.addEventListener('mouseup', function() {
        for (var key in illustrator.statuses) {
          illustrator.statuses[key] = 'loaded';
        }
        illustrator.tileHistograms = {};
        illustrator.clusters = {};
        illustrator.distances = {};
        rowsLabel.innerHTML = rows.value;
        illustrator.ROWS = rows.value;
        similarTiles.min = illustrator.calculateMinimumSimilarTiles();
        similarTiles.max = illustrator.ROWS * illustrator.COLS;
        similarTiles.value = illustrator.calculateSimilarTiles();
        illustrator.SIMILAR_TILES = similarTiles.value;
        similarTilesLabel.innerHTML = similarTiles.value;
        if (illustrator.DEBUG) console.log('calculate histograms');
        for (var url in illustrator.images) {
          illustrator.calculateHistogram(illustrator.images[url]);
        }
      });

      var cols = document.getElementById('cols');
      cols.value = illustrator.COLS;
      cols.max = 50;
      cols.min = 1;
      var colsLabel = document.getElementById('colsLabel');
      colsLabel.innerHTML = cols.value;
      cols.addEventListener('change', function() {
        colsLabel.innerHTML = cols.value;
      });
      cols.addEventListener('mouseup', function() {
        for (var key in illustrator.statuses) {
          illustrator.statuses[key] = 'loaded';
        }
        illustrator.tileHistograms = {};
        illustrator.clusters = {};
        illustrator.distances = {};
        colsLabel.innerHTML = cols.value;
        illustrator.COLS = cols.value;
        similarTiles.min = illustrator.calculateMinimumSimilarTiles();
        similarTiles.max = illustrator.ROWS * illustrator.COLS;
        similarTiles.value = illustrator.calculateSimilarTiles();
        illustrator.SIMILAR_TILES = similarTiles.value;
        similarTilesLabel.innerHTML = similarTiles.value;
        if (illustrator.DEBUG) console.log('calculate histograms');
        for (var url in illustrator.images) {
          illustrator.calculateHistogram(illustrator.images[url]);
        }
      });

      var threshold = document.getElementById('threshold');
      threshold.value = illustrator.THRESHOLD;
      var thresholdLabel = document.getElementById('thresholdLabel');
      thresholdLabel.innerHTML = threshold.value;
      threshold.addEventListener('change', function() {
        thresholdLabel.innerHTML = threshold.value;
      });
      threshold.addEventListener('mouseup', function() {
        thresholdLabel.innerHTML = threshold.value;
        illustrator.THRESHOLD = threshold.value;
        illustrator.clusters = {};
        if (illustrator.checkMediaItemStatuses('histogram')) {
          illustrator.sort();
        };
      });

      var similarTiles = document.getElementById('similarTiles');
      similarTiles.min = illustrator.calculateMinimumSimilarTiles();
      similarTiles.max = illustrator.ROWS * illustrator.COLS;
      similarTiles.value = illustrator.calculateSimilarTiles();
      illustrator.SIMILAR_TILES = similarTiles.value;
      var similarTilesLabel =
          document.getElementById('similarTilesLabel');
      similarTilesLabel.innerHTML = similarTiles.value;
      similarTiles.addEventListener('change', function() {
        similarTilesLabel.innerHTML = similarTiles.value;
      });
      similarTiles.addEventListener('mouseup', function() {
        similarTilesLabel.innerHTML = similarTiles.value;
        illustrator.SIMILAR_TILES = similarTiles.value;
        illustrator.clusters = {};
        if (illustrator.checkMediaItemStatuses('histogram')) {
          illustrator.sort();
        };
      });

      var bwTolerance = document.getElementById('bwTolerance');
      bwTolerance.max = 10;
      bwTolerance.min = 0;
      bwTolerance.value = illustrator.BW_TOLERANCE;
      var bwToleranceLabel =
          document.getElementById('bwToleranceLabel');
      bwToleranceLabel.innerHTML = bwTolerance.value;
      bwTolerance.addEventListener('change', function() {
        bwToleranceLabel.innerHTML = bwTolerance.value;
      });
      bwTolerance.addEventListener('mouseup', function() {
        bwToleranceLabel.innerHTML = bwTolerance.value;
        illustrator.BW_TOLERANCE = bwTolerance.value;
        if (illustrator.checkMediaItemStatuses('histogram')) {
          illustrator.clusters = {};
          illustrator.distances = {};
          illustrator.calculateDistances();
        };
      });

      var searchForm = document.getElementById('search_form');
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var query = document.getElementById('query').value;
        illustrator.search(query);
      }, false);

      // reset button
      var resetButton = document.getElementById('reset');
      resetButton.addEventListener('click', function() {
        illustrator.reset();
      });

      var queryLogDiv = document.getElementById('queryLog');
      queryLog.addEventListener('click', function(e) {
        if ((e.target.nodeName.toLowerCase() === 'input') ||
            (e.target.nodeName.toLowerCase() === 'label')) {
          // can use checkbox, even if the label was clicked
          var target = e.target;
          var queryId = target.parentNode.getElementsByTagName('label')[0]
              .getAttribute('for');
          var checkbox = target.parentNode.getElementsByTagName('input')[0];
          var displayState = '';
          if (checkbox.checked) {
            displayState = 'inline';
          } else {
            displayState = 'none';
          }
          var sources = illustrator.origins[queryId].forEach(function(source) {
            var images = document.querySelectorAll('img[src="' + source + '"]');
            for (var i = 0, len = images.length; i < len; i++) {
              images[i].parentNode.style.display = displayState;
            }
          });
        }
      });

      // sort by similarity
      var similaritySort = document.getElementById('similaritySort');
      similaritySort.addEventListener('click', function() {
        if (illustrator.checkMediaItemStatuses('histogram')) {
          illustrator.sort();
        };
      });
    },
    initSockets: function() {
      if (illustrator.DEBUG) console.log('init sockets');
      illustrator.socket.on('proxy', function(data) {
        var socketData = document.getElementById('socketData');
        socketData.innerHTML = 'Loading file ' + data.url;
      });
      illustrator.socket.on('mediaResults', function(data) {
        var socketData = document.getElementById('socketData');
        socketData.innerHTML = 'Receiving results from ' + data.service;
      });
    },
    /**
     * Resets all GUI elements
     */
    reset: function reset() {
      if (illustrator.DEBUG) console.log('reset');
      document.getElementById('results').innerHTML = '';
      document.getElementById('queryLog').innerHTML = '';
      document.getElementById('socketData').innerHTML = '';
      document.getElementById('query').value = '';
      illustrator.statuses = {};
      illustrator.tileHistograms = {};
      illustrator.distances = {};
      illustrator.origins = {};
      illustrator.clusters = {};
      illustrator.faces = {};
      illustrator.images = {};
      illustrator.mediaItems = {};
      illustrator.mediaItemUrls = {};
     },
    /**
     * Searches for a term on a plethora of social media platforms
     */
    search: function(query) {
      if (!query) {
        return false;
      }
      if (illustrator.DEBUG) console.log('search ' + query);
      var queryLogDiv = document.getElementById('queryLog');
      var queryId = new Date().getTime();
      queryLogDiv.innerHTML +=
          '<div><input type="checkbox" checked="checked" id="' + queryId +
          '"> <label for="' + queryId + '">' + query + '</label></div>';
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var results = JSON.parse(xhr.responseText);
            illustrator.processSearchResults(results, queryId);
          }
        }
      }
      var url = illustrator.MEDIA_SERVER + 'combined/' +
          encodeURIComponent(query);
      xhr.open("GET", url, true);
      xhr.send(null);
      return false;
    },
    /**
     * Processes the results
     */
    processSearchResults: function(results, queryId) {
      if (illustrator.DEBUG) console.log('receive search results');
      illustrator.distances = {};
      if (illustrator.DEBUG) console.log('detect faces');
      if (illustrator.DEBUG) console.log('calculate histograms');
      for (var service in results) {
        results[service].forEach(function(item) {
          // media asset
          var micropostUrl = item.micropostUrl;
          // if we already have this media item, continue to the next one
          // using the micropostUrl as the posterUrl isn't stable
          if (illustrator.mediaItemUrls[micropostUrl] !== undefined) {
            return;
          }
          var posterUrl = illustrator.PROXY_SERVER +
              encodeURIComponent(item.posterUrl);
          item.origin = service;

          var image = new Image();
          image.setAttribute('class', 'photo');
          image.onerror = function() {
            try {
              image.parentNode.removeChild(image);
            } catch(e) {
              // noop
            }
            delete illustrator.statuses[posterUrl];
            console.log('Removed ' + image.src);
          };

          image.src = posterUrl;
          illustrator.statuses[posterUrl] = false;
          image.onload = function() {
            illustrator.statuses[posterUrl] = true;
            illustrator.mediaItems[posterUrl] = item;
            illustrator.mediaItemUrls[micropostUrl] = true;
            illustrator.images[posterUrl] = image;
            if (!illustrator.origins[queryId]) {
              illustrator.origins[queryId] = [posterUrl];
            } else {
              illustrator.origins[queryId].push(posterUrl);
            }
            illustrator.detectFaces(image, image.width, image.height);
            illustrator.calculateHistogram(image);
          };

          // make sure the load event fires for cached images too
          if (image.complete || image.complete === undefined) {
            image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
            image.src = posterUrl;
          }
        });
      }
    },
    detectFaces: function(img, width, height) {
      var comp = ccv.detect_objects({
        canvas: ccv.grayscale(ccv.pre(img, width, height)),
        cascade: cascade,
        interval: 5,
        min_neighbors: 1
      });
      illustrator.faces[img.src] = comp;
    },
    calculateHistogram: function(img) {
      illustrator.ctx.clearRect (0, 0, illustrator.canvas.width,
          illustrator.canvas.height);
      // draw the image on the canvas
      illustrator.ctx.drawImage(img, 0, 0, illustrator.canvas.width,
          illustrator.canvas.height);

      // calculate the histograms tile-wise
      var sw = ~~(img.width / illustrator.COLS);
      var sh = ~~(img.height / illustrator.ROWS);
      var dw = ~~(illustrator.canvas.width / illustrator.COLS);
      var dh = ~~(illustrator.canvas.height / illustrator.ROWS);

      illustrator.tileHistograms[img.src] = {};
      var len = illustrator.COLS * illustrator.ROWS;
      for (var i = 0; i < len; i++) {
        // calculate the boundaries for the current tile from the
        // image and translate it to boundaries on the main canvas
        var mod = (i % illustrator.COLS);
        var div = ~~(i / illustrator.COLS);
        var sx = mod * sw;
        var sy = div * sh;
        var dx = mod * dw;
        var dy = div * dh;
        // calculate the histogram of the current tile
        var histogram =
            Histogram.getHistogram(illustrator.ctx, dx, dy, dw, dh, false);
        illustrator.tileHistograms[img.src][i] = {
          r: histogram.pixel.r,
          g: histogram.pixel.g,
          b: histogram.pixel.b
        };
      }

      illustrator.statuses[img.src] = 'histogram';
      if (illustrator.checkMediaItemStatuses('histogram')) {
        illustrator.calculateDistances();
      };
    },
    calculateDistances: function() {
      if (illustrator.DEBUG) console.log('calculate distances');
      var keys = Object.keys(illustrator.tileHistograms);
      var len = keys.length;
      var abs = Math.abs;

      if (illustrator.ACCOUNT_FOR_LUMINANCE) {
        var rFactor = 0.3;
        var gFactor = 0.59;
        var bFactor = 0.11;
      } else {
        var rFactor = 1;
        var gFactor = 1;
        var bFactor = 1;
      }

      var blackTolerance = illustrator.BW_TOLERANCE;
      var whiteTolerance = 255 - illustrator.BW_TOLERANCE;

      for (var i = 0; i < len; i++) {
        var outer = keys[i];
        illustrator.distances[outer] = {};
        var outerHisto = illustrator.tileHistograms[outer];
        for (var j = 0; j < len; j++) {
          if (j === i) continue;
          var inner = keys[j];
          var innerHisto = illustrator.tileHistograms[inner];
          illustrator.distances[outer][inner] = {};
          // recycle because of symmetry of distances:
          // dist(A<=>B) =  dist(B<=>A)
          if ((illustrator.distances[inner]) &&
              (illustrator.distances[inner][outer])) {
            illustrator.distances[outer][inner] =
                illustrator.distances[inner][outer];
          // calculate new
          } else {
            for (var k in innerHisto) {
              var innerR = innerHisto[k].r;
              var innerG = innerHisto[k].g;
              var innerB = innerHisto[k].b;
              var outerR = outerHisto[k].r;
              var outerG = outerHisto[k].g;
              var outerB = outerHisto[k].b;
              if ((innerR >= blackTolerance &&
                   innerG >= blackTolerance &&
                   innerB >= blackTolerance) &&
                  (outerR >= blackTolerance &&
                   outerG >= blackTolerance &&
                   outerB >= blackTolerance) &&
                  (innerR <= whiteTolerance &&
                   innerG <= whiteTolerance &&
                   innerB <= whiteTolerance) &&
                  (outerR <= whiteTolerance &&
                   outerG <= whiteTolerance &&
                   outerB <= whiteTolerance)) {
                illustrator.distances[outer][inner][k] =
                  ~~((abs(rFactor * (innerR - outerR)) +
                      abs(gFactor * (innerG - outerG)) +
                      abs(bFactor * (innerB - outerB))) / 3);
              } else {
                illustrator.distances[outer][inner][k] = null;
              }
            }
          }
        }
      }
      illustrator.sort();
    },
    sort: function() {
      if (illustrator.DEBUG) console.log('sort');

      var keys = Object.keys(illustrator.tileHistograms);
      var len = keys.length;
      var abs = Math.abs;
      var max = Math.max;
      var minimumSimilarTiles = illustrator.calculateMinimumSimilarTiles();
      // the actual sorting
      for (var i = 0; i < len; i++) {
        if (!keys[i]) continue;
        var outer = keys[i];
        illustrator.clusters[outer] = [];
        keys[i] = false;
        var distanceToOuter = {};
        for (var j = 0; j < len; j++) {
          if (j === i) {
            continue;
          }
          var inner = keys[j];
          var similarTiles = 0;
          var distance = illustrator.distances[outer][inner];
          var nulls = 0;
          for (var k in distance) {
            if (distance[k] !== null) {
              if (distance[k] <= illustrator.THRESHOLD) {
                similarTiles++;
              }
            } else {
              nulls++;
            }
          }
          var minimumRequired;
          if (illustrator.SIMILAR_TILES - nulls >= minimumSimilarTiles) {
            minimumRequired = illustrator.SIMILAR_TILES - nulls;
          } else {
            minimumRequired = minimumSimilarTiles;
          }
          if (similarTiles >= minimumRequired) {
            if (illustrator.CONSIDER_FACES) {
              var outerFaces = illustrator.faces[outer].length;
              var innerFaces = illustrator.faces[inner].length;
              if (innerFaces === outerFaces) {
                if (!distanceToOuter[similarTiles]) {
                  distanceToOuter[similarTiles] = [j];
                } else {
                  distanceToOuter[similarTiles].push(j);
                }
              }
            } else {
              if (!distanceToOuter[similarTiles]) {
                distanceToOuter[similarTiles] = [j];
              } else {
                distanceToOuter[similarTiles].push(j);
              }
            }
          }
        }
        Object.keys(distanceToOuter).sort(function(a, b) {
          return b - a;
        }).forEach(function(key) {
          distanceToOuter[key].forEach(function(index) {
            illustrator.clusters[outer].push(keys[index]);
            keys[index] = false;
          });
        });
      }
      illustrator.display();
    },
    display: function() {
      if (illustrator.DEBUG) console.log('display');
      var resultsDiv = document.getElementById('results');
      var clusterSizes = {};
      for (var key in illustrator.clusters) {
        if (!clusterSizes[illustrator.clusters[key].length]) {
          clusterSizes[illustrator.clusters[key].length] = [key];
        } else {
          clusterSizes[illustrator.clusters[key].length].push(key);
        }
      }

      var faviconHtml = function(service) {
        return '<img class="favicon" src="./resources/' +
            service.toLowerCase() + '.png' + '"/>';
      };

      var micropostHtml = function(url) {
        var img = illustrator.images[url];
        var width = Math.ceil(100 / img.height * img.width);
        return '<div class="micropost" style="width:' + width + 'px;">' +
            illustrator.mediaItems[url].micropost.plainText +
            '</div>';
      };

      var html = [];
      Object.keys(clusterSizes).sort(function(a, b) {
        return b - a;
      }).forEach(function(index) {
        clusterSizes[index].forEach(function(key) {
          html.push('<div class="cluster">' +
              '<div class="firstMediaItem mediaItem">' +
              '<img class="photo" src="' +
              key + '"/>' + faviconHtml(illustrator.mediaItems[key].origin) +
              micropostHtml(key) + '</div>' +
              illustrator.clusters[key].map(function(url) {
                return '<div class="mediaItem">' +
                    '<img class="photo" src="' + url + '"/>' +
                    faviconHtml(illustrator.mediaItems[url].origin) +
                    micropostHtml(url) + '</div>';
              }).join('') + '</div>');
        });
      });
      resultsDiv.innerHTML = '';
      resultsDiv.innerHTML = html.join('');
      for (var key in illustrator.faces) {
        if (illustrator.faces[key].length > 0) {
          var image = document.querySelector('img[src="' + key + '"]');
          image.style.borderLeft = 'solid red 2px';
          image.style.borderRight = 'solid red 2px';
        }
      }
    }
  };

  var debug = document.getElementById('debug');
  window.setInterval(function() {
    var images = document.getElementsByClassName('photo');
    debug.innerHTML = 'Images: ' + images.length;
  }, 2000);

  // init
  illustrator.init();
})();