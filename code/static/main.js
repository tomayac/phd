(function() {
  var illustrator = {
    DEBUG: true,
    MEDIA_SERVER: 'http://localhost:8001/search/',
    PROXY_SERVER: 'http://localhost:8001/proxy/',
    THRESHOLD: 10,
    ACCOUNT_FOR_LUMINANCE: true,
    BW_TOLERANCE: 3,
    COLS: 5,
    ROWS: 5,
    SIMILAR_TILES: 0,
    CONSIDER_FACES: true,
    loaded: {},
    distances: {},
    origins: {},
    tileHistograms: {},
    faces: {},
    socket: null,
    // checks if all media items are of the given status
    checkIfAllMediaItems: function(status) {
      for (var key in illustrator.loaded) {
        if (illustrator.loaded[key] !== status) {
          return false;
        }
      }
      return true;
    },
    /**
     * Initialzes the application
     */
    init: function() {
      illustrator.socket = io.connect('http://localhost:8001/');
      illustrator.initSockets();

      if (illustrator.DEBUG) console.log('init');
      illustrator.reset();

      var resultsDiv = document.getElementById('results');
      results.addEventListener('click', function(e) {
        if (e.target.nodeName.toLowerCase() !== 'img') {
          return;
        };
        var img = e.target;
        var src = img.src;
        var canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        canvas.style.marginLeft = img.style.marginLeft;
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
      });

      var luminance = document.getElementById('luminance');
      luminance.checked = illustrator.ACCOUNT_FOR_LUMINANCE;
      luminance.addEventListener('change', function() {
        illustrator.ACCOUNT_FOR_LUMINANCE = luminance.checked;
        illustrator.distances = {};
        illustrator.sort();
      });

      var threshold = document.getElementById('threshold');
      threshold.value = illustrator.THRESHOLD;
      var thresholdLabel = document.getElementById('thresholdLabel');
      thresholdLabel.innerHTML = threshold.value;
      threshold.addEventListener('change', function() {
        thresholdLabel.innerHTML = threshold.value;
        illustrator.THRESHOLD = threshold.value;
        if (illustrator.checkIfAllMediaItems('histogram')) {
          illustrator.sort();
        };
      });

      var similarTiles = document.getElementById('similarTiles');
      similarTiles.min = 1;
      similarTiles.max = illustrator.ROWS * illustrator.COLS;
      similarTiles.value = Math.floor(illustrator.ROWS * illustrator.COLS * 0.9);
      illustrator.SIMILAR_TILES = similarTiles.value;
      var similarTilesLabel =
          document.getElementById('similarTilesLabel');
      similarTilesLabel.innerHTML = similarTiles.value;
      similarTiles.addEventListener('change', function() {
        similarTilesLabel.innerHTML = similarTiles.value;
        illustrator.SIMILAR_TILES = similarTiles.value;
        if (illustrator.checkIfAllMediaItems('histogram')) {
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
        illustrator.BW_TOLERANCE = bwTolerance.value;
        if (illustrator.checkIfAllMediaItems('histogram')) {
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
          var query = target.parentNode.getElementsByTagName('label')[0]
              .getAttribute('for');
          var checkbox = target.parentNode.getElementsByTagName('input')[0];
          query = query.replace(/\_/g, ' ');
          var displayState = '';
          if (checkbox.checked) {
            console.log('Showing media items from query "' + query + '"');
            displayState = 'inline';
          } else {
            console.log('Hiding media items from query "' + query + '"');
            displayState = 'none';
          }
          var sources = illustrator.origins[query].forEach(function(source) {
            var images = document.querySelectorAll('img[src="' + source + '"]');
            for (var i = 0, len = images.length; i < len; i++) {
              images[i].style.display = displayState;
            }
          });
        }
      });

      // sort by similarity
      var similaritySort = document.getElementById('similaritySort');
      similaritySort.addEventListener('click', function() {
        if (illustrator.checkIfAllMediaItems('histogram')) {
          illustrator.sort();
        };
      });
    },
    initSockets: function() {
      if (illustrator.DEBUG) console.log('init sockets');
      illustrator.socket.on('proxy', function(data) {
        var socketData = document.getElementById('socket_data');
        socketData.innerHTML = 'Loading file ' + data.url;
      });
      illustrator.socket.on('mediaResults', function(data) {
        var socketData = document.getElementById('socket_data');
        socketData.innerHTML = 'Receiving results from ' + data.service;
      });
    },
    /**
     * Resets all GUI elements
     */
     reset: function reset() {
       if (illustrator.DEBUG) console.log('reset');
       var resultsDiv = document.getElementById('results');
       resultsDiv.innerHTML = '';
       var queryLogDiv = document.getElementById('queryLog');
       queryLogDiv.innerHTML = '';
       var query = document.getElementById('query');
       query.value = '';
       illustrator.loaded = {};
       illustrator.tileHistograms = {};
       illustrator.distances = {};
       illustrator.origins = {};
       illustrator.faces = {};
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
      var queryId = query.replace(/\s/g, '_');
      queryLogDiv.innerHTML +=
          '<div><input type="checkbox" checked="checked" id="' + queryId +
          '"> <label for="' + queryId + '">' + query + '</label></div>';
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var results = JSON.parse(xhr.responseText);
            illustrator.show(results, query);
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
     * Shows the results
     */
    show: function(results, query) {
      if (illustrator.DEBUG) console.log('show results');
      var resultsDiv = document.getElementById('results');
      illustrator.distances = {};
      for (var service in results) {
        results[service].forEach(function(item) {
          // media asset
          var image = new Image();
          image.setAttribute('class', 'photo');
          var source = illustrator.PROXY_SERVER +
              encodeURIComponent(item.posterUrl);

          image.onerror = function() {
            try{
              image.parentNode.removeChild(image);
            } catch(e) {
              // noop
            }
            delete illustrator.loaded[source];
            console.log('Removed ' + image.src);
          };

          image.src = source;
          illustrator.loaded[source] = false;
          image.onload = function() {
            illustrator.loaded[source] = true;
            if (!illustrator.origins[query]) {
              illustrator.origins[query] = [source];
            } else {
              illustrator.origins[query].push(source);
            }
            illustrator.detectFaces(image);
            illustrator.histogram(image);
          };

          // make sure the load event fires for cached images too
          if (image.complete || image.complete === undefined) {
            image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
            image.src = source;
          }
        });
      }
    },
    detectFaces: function(img) {
      if (illustrator.DEBUG) console.log('detect faces');
      var comp = ccv.detect_objects({
        canvas: ccv.grayscale(ccv.pre(img)),
        cascade: cascade,
        interval: 5,
        min_neighbors: 1
      });
      illustrator.faces[img.src] = comp;
    },
    histogram: function(img) {
      if (illustrator.DEBUG) console.log('calculate histograms');
      // draw the image on the canvas
      var canvas = document.createElement('canvas');
      canvas.width = 128; //img.width;
      canvas.height = 128; //img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // calculate the histograms tile-wise
      var sw = ~~(img.width / illustrator.COLS);
      var sh = ~~(img.height / illustrator.ROWS);
      var dw = ~~(canvas.width / illustrator.COLS);
      var dh = ~~(canvas.height / illustrator.ROWS);

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
            Histogram.getHistogram(ctx, dx, dy, dw, dh, false);
        illustrator.tileHistograms[img.src][i] = {
          r: histogram.pixel.r,
          g: histogram.pixel.g,
          b: histogram.pixel.b
        };
      }

      illustrator.loaded[img.src] = 'histogram';
      if (illustrator.checkIfAllMediaItems('histogram')) {
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

              if ((innerR > blackTolerance &&
                   innerG > blackTolerance &&
                   innerB > blackTolerance) &&
                  (outerR > blackTolerance &&
                   outerG > blackTolerance &&
                   outerB > blackTolerance) &&
                  (innerR < whiteTolerance &&
                   innerG < whiteTolerance &&
                   innerB < whiteTolerance) &&
                  (outerR < whiteTolerance &&
                   outerG < whiteTolerance &&
                   outerB < whiteTolerance)) {
                illustrator.distances[outer][inner][k] =
                  ~~((abs(rFactor * (innerR - outerR)) +
                      abs(gFactor * (innerG - outerG)) +
                      abs(bFactor * (innerB - outerB))) / 3);
              }
            }
          }
        }
      }
      illustrator.sort();
    },
    sort: function() {
      if (illustrator.DEBUG) console.log('sort');
      var resultsDiv = document.getElementById('results');
      var clusters = {};

      var keys = Object.keys(illustrator.tileHistograms);
      var len = keys.length;
      var abs = Math.abs;
      var max = Math.max;

      // the actual sorting
      for (var i = 0; i < len; i++) {
        if (!keys[i]) continue;
        var outer = keys[i];
        clusters[outer] = [];
        keys[i] = false;
        var distanceToOuter = {};
        for (var j = 0; j < len; j++) {
          if (j === i) {
            continue;
          }
          var inner = keys[j];
          var similarTiles = 0;
          var distances = illustrator.distances[outer][inner];
          for (var k in distances) {
            if (distances[k] <= illustrator.THRESHOLD) {
              similarTiles++;
            }
          }
          if (similarTiles >= illustrator.SIMILAR_TILES) {
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
        if (Object.keys(distanceToOuter).length) {
          var mostSimilar = distanceToOuter[max.apply(null,
                Object.keys(distanceToOuter).map(function(num) {
                  return parseInt(num, 10);
                }))];
          mostSimilar.forEach(function(index) {
            clusters[outer].push(keys[index]);
            keys[index] = false;
          });
        }
      }
      var clusterSizes = {};
      for (key in clusters) {
        if (!clusterSizes[clusters[key].length]) {
          clusterSizes[clusters[key].length] = [key];
        } else {
          clusterSizes[clusters[key].length].push(key);
        }
      }

      var html = [];
      Object.keys(clusterSizes).sort().reverse().forEach(function(index) {
        clusterSizes[index].forEach(function(key) {
          html.push('<img style="margin-left:50px;" class="photo" src="' +
              key +'"/>' + clusters[key].map(function(url) {
                return '<img class="photo" src="' + url +'"/>';
              }).join(''));
        });
      });
      resultsDiv.innerHTML = '';
      resultsDiv.innerHTML = html.join('');
      for (var key in illustrator.faces) {
        if (illustrator.faces[key].length > 0) {
          var image = document.querySelector('img[src="' + key + '"]');
          image.style.border = 'solid red 2px';
        }
      }
    }
  };

  var debug = document.getElementById('debug');
  window.setInterval(function() {
    var images = document.getElementsByClassName('photo');
    debug.innerHTML = 'Images ' + images.length;
  }, 2000);

  // init
  illustrator.init();
})();