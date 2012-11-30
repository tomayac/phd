(function() {
  var illustrator = {
    DEBUG: true,
    MEDIA_SERVER: 'http://localhost:8001/search/',
    PROXY_SERVER: 'http://localhost:8001/proxy/',
    THRESHOLD: 5,
    ACCOUNT_FOR_LUMINANCE: true,
    COLS: 5,
    ROWS: 5,
    SIMILAR_TILES: 0,
    loaded: {},
    distances: {},
    tileHistograms: {},
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
      similarTiles.value =
          Math.ceil(illustrator.ROWS * illustrator.COLS * 0.8);
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

      // sort by similarity
      var similaritySort = document.getElementById('similaritySort');
      similaritySort.addEventListener('click', function() {
        if (illustrator.checkIfAllMediaItems('histogram')) {
          illustrator.sort();
        };
      });
    },
    initSockets: function() {
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
      queryLogDiv.innerHTML += '<br/>' + query;
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var results = JSON.parse(xhr.responseText);
            illustrator.show(results);
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
    show: function(results) {
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

          //resultsDiv.appendChild(image);
          image.setAttribute('alt', service);
          image.src = source;
          illustrator.loaded[source] = false;
          image.onload = function() {
            illustrator.loaded[source] = true;
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
    histogram: function(img) {
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

        ctx.fillStyle = histogram.css;
        ctx.fillRect(dx, dy, dw, dh);
      }

      illustrator.loaded[img.src] = 'histogram';
      if (illustrator.checkIfAllMediaItems('histogram')) {
        illustrator.sort();
      };
    },
    sort: function() {
      var resultsDiv = document.getElementById('results');
      var clusters = {};
      var distancesCalculated =
          Object.keys(illustrator.distances).length ? true : false;

      var keys = Object.keys(illustrator.tileHistograms);
      var len = keys.length;

      if (!distancesCalculated) {
        if (illustrator.ACCOUNT_FOR_LUMINANCE) {
          var rFactor = 0.3;
          var gFactor = 0.59;
          var bFactor = 0.11;
        } else {
          var rFactor = 1;
          var gFactor = 1;
          var bFactor = 1;
        }
        var abs = Math.abs;

        for (var i = 0; i < len; i++) {
          var outer = keys[i];
          illustrator.distances[outer] = {};
          var outerHistograms = illustrator.tileHistograms[outer];
          for (var j = 0; j < len; j++) {
            if (j === i) continue;
            var inner = keys[j];
            var innerHistograms = illustrator.tileHistograms[inner];
            illustrator.distances[outer][inner] = {};
            for (var k in innerHistograms) {
              illustrator.distances[outer][inner][k] =
                ~~((abs(rFactor * (innerHistograms[k].r - outerHistograms[k].r)) +
                    abs(gFactor * (innerHistograms[k].g - outerHistograms[k].g)) +
                    abs(bFactor * (innerHistograms[k].b - outerHistograms[k].b))) / 3);
            }
          }
        }
      }
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
          for (var k in illustrator.distances[outer][inner]) {
            if (illustrator.distances[outer][inner][k] <= illustrator.THRESHOLD) {
              similarTiles++;
            }
          }
          if (similarTiles >= illustrator.SIMILAR_TILES) {
            if (!distanceToOuter[similarTiles]) {
              distanceToOuter[similarTiles] = [j];
            } else {
              distanceToOuter[similarTiles].push(j);
            }
          }
        }
        if (Object.keys(distanceToOuter).length) {
          var mostSimilar = distanceToOuter[Math.max.apply(null,
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