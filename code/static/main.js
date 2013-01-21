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
    MAX_LINE_HEIGHT: 200,
    thumbnails: {},
    images: {},
    mediaItems: {},
    mediaItemUrls: {},
    statuses: {},
    distances: {},
    origins: {},
    clusters: {},
    rankedClusters: {},
    ranking: {},
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
      if (illustrator.DEBUG) illustrator.debug();

      illustrator.socket = io.connect('http://localhost:8001/');
      illustrator.initSockets();

      illustrator.canvas = document.createElement('canvas');
      illustrator.canvas.width = 100;
      illustrator.canvas.height = 100;
      illustrator.ctx = illustrator.canvas.getContext('2d');

      if (illustrator.DEBUG) console.log('Initializing app');
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
          if (illustrator.DEBUG) console.log('Similar tiles: ' + similarTiles +
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
                if (illustrator.DEBUG) console.log('Detected faces: ' +
                    innerFaces + '\n------------');
              }
            }
          }
        }
      });

      var mouseover = function(e) {
        if ((e.target.nodeName.toLowerCase() !== 'img') &&
            (e.target.nodeName.toLowerCase() !== 'video') &&
            (e.target.nodeName.toLowerCase() !== 'span')) {
          return;
        };
        var img = e.target.parentNode.querySelector('img, video');
        var close = img.parentNode.querySelector('span.close');
        close.style.display = 'block';
      };

      var mouseout = function(e) {
        if ((e.target.nodeName.toLowerCase() !== 'img') &&
            (e.target.nodeName.toLowerCase() !== 'video') &&
            (e.target.nodeName.toLowerCase() !== 'span')) {
          return;
        };
        var img = e.target.parentNode.querySelector('img, video');
        var close = img.parentNode.querySelector('span.close');
        close.style.display = 'none';
      };

      var click = function(e) {
        if ((e.target.nodeName.toLowerCase() !== 'span') &&
            (!e.target.classList.contains('close'))) {
          return;
        }
        var close = e.target;
        var img = close.parentNode.querySelector(
            'img.photo, video.photo, img.gallery, video.gallery');
        var posterUrl = img.dataset.posterurl;
        var cascadingDeletion = true;
        if (close.parentNode.parentNode.classList.contains('cluster')) {
          cascadingDeletion = false;
        };
        illustrator.deleteMediaItem(posterUrl, cascadingDeletion, posterUrl,
            true);
      };

      resultsDiv.addEventListener('mouseover', function(e) {
        mouseover(e);
      });
      resultsDiv.addEventListener('mouseout', function(e) {
        mouseout(e);
      });
      resultsDiv.addEventListener('click', function(e) {
        click(e);
      });

      var rankedList = document.getElementById('rankedList');
      rankedList.addEventListener('mouseover', function(e) {
        mouseover(e);
      });
      rankedList.addEventListener('mouseout', function(e) {
        mouseout(e);
      });
      rankedList.addEventListener('click', function(e) {
        click(e);
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
        if (illustrator.DEBUG) console.log('Sorting media items');
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
        if (illustrator.DEBUG) console.log('Calculating histograms');
        for (var url in illustrator.thumbnails) {
          illustrator.calculateHistogram(illustrator.thumbnails[url]);
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
        if (illustrator.DEBUG) console.log('Calculating histograms');
        for (var url in illustrator.thumbnails) {
          illustrator.calculateHistogram(illustrator.thumbnails[url]);
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
          var sources = illustrator.queries[queryId].forEach(function(source) {
            var images = document.querySelectorAll('img[src="' + source + '"]');
            for (var i = 0, len = images.length; i < len; i++) {
              images[i].parentNode.style.display = displayState;
            }
          });
        }
      });

      var toggleVideoPlayStateButton = document.getElementById('playAllVideos');
      toggleVideoPlayStateButton.addEventListener('click', function(e) {
        var videos = document.querySelectorAll('video');
        for (var i = 0, len = videos.length; i < len; i++) {
          var video = videos[i];
          if (video.paused) {
            video.play();
            this.innerHTML = 'Pause all videos';
          } else {
            video.pause();
            this.innerHTML = 'Play all videos';
          }
        }
      });

      var muteVideosButton = document.getElementById('muteAllVideos');
      muteAllVideos.addEventListener('click', function(e) {
        var videos = document.querySelectorAll('video');
        for (var i = 0, len = videos.length; i < len; i++) {
          var video = videos[i];
          if (video.muted) {
            video.muted = false;
            this.innerHTML = 'Mute all videos';
          } else {
            video.muted = true;
            this.innerHTML = 'Unmute all videos';
          }
        }
      });
    },
    deleteMediaItem: function(posterUrl, cascadingDeletion, originalPosterUrl,
        isFirstRun) {
      var deleteObject = function(objects) {
        objects.forEach(function(array) {
          var object = array[0];
          var key = array[1];
          var before = Object.keys(object).length;
          delete object[key];
          var after  = Object.keys(object).length;
          if (before === after) {
            console.log('DELETE fail ' + array[2] + ': ' + Object.keys(object).length);
          }
        });
      };

      if (isFirstRun && cascadingDeletion) {
        if (illustrator.clusters[originalPosterUrl]) {
          if (illustrator.DEBUG) console.log('Deleting the whole cluster of ' +
              originalPosterUrl + ' and ' +
              illustrator.clusters[originalPosterUrl].length +
              ' cascading media items');
          // mutating the array below, so working on a copy here
          var copy = [];
          var len = illustrator.clusters[originalPosterUrl].length;
          for (var i = 0; i < len; i++) {
            copy[i] = illustrator.clusters[originalPosterUrl][i];
          }
          copy.forEach(function(key) {
            illustrator.deleteMediaItem(key, true, originalPosterUrl, false);
          });
        }
      }

      if (illustrator.DEBUG) console.log('Deleting ' + posterUrl);
      if (illustrator.mediaItems[posterUrl]) {
        var micropostUrl = illustrator.mediaItems[posterUrl].micropostUrl;
        var noProxyMediaUrl = illustrator.mediaItems[posterUrl].mediaUrl;
        var noProxyPosterUrl = illustrator.mediaItems[posterUrl].posterUrl;
        deleteObject([
          [illustrator.mediaItemUrls, micropostUrl, 'mediaItemUrls'],
          [illustrator.images, noProxyPosterUrl, 'images'],
          [illustrator.images, noProxyMediaUrl, 'images']
        ]);
      }
      deleteObject([
        [illustrator.statuses, posterUrl, 'statuses'],
        [illustrator.thumbnails, posterUrl, 'thumbnails'],
        [illustrator.mediaItems, posterUrl, 'mediaItems'],
        [illustrator.distances, posterUrl, 'distances'],
        [illustrator.tileHistograms, posterUrl, 'tileHistograms'],
        [illustrator.faces, posterUrl, 'faces']
      ]);
      for (var key in illustrator.distances) {
        deleteObject([
          [illustrator.distances[key], posterUrl, 'distances[' + key + ']']
        ]);
      }
      for (var key in illustrator.queries) {
        for (var i = 0, len = illustrator.queries[key].length; i < len; i++) {
          if (illustrator.queries[key][i] === posterUrl) {
            illustrator.queries[key].splice(i, 1);
            break;
          }
        }
      }
      if (!cascadingDeletion) {
        illustrator.rankedClusters = {};
        illustrator.ranking = {};
        illustrator.clusters = {};
        illustrator.sort();
      } else {
        if (illustrator.clusters[originalPosterUrl].length === 0) {
          illustrator.rankedClusters = {};
          illustrator.ranking = {};
          illustrator.clusters = {};
          illustrator.sort();
        } else {
          illustrator.clusters[originalPosterUrl].pop();
        }
      }
    },
    initSockets: function() {
      if (illustrator.DEBUG) console.log('Initializing WebSockets');
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
      if (illustrator.DEBUG) console.log('Resetting app');
      document.querySelector('.step1').style.display = 'block';
      document.querySelector('.step2').style.display = 'none';
      document.getElementById('results').innerHTML = '';
      document.getElementById('queryLog').innerHTML = '';
      document.getElementById('socketData').innerHTML = '';
      document.getElementById('rankedList').innerHTML = '';
      document.getElementById('query').value = '';
      illustrator.statuses = {};
      illustrator.tileHistograms = {};
      illustrator.distances = {};
      illustrator.queries = {};
      illustrator.clusters = {};
      illustrator.rankedClusters = {};
      illustrator.ranking = {};
      illustrator.faces = {};
      illustrator.thumbnails = {};
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
      if (illustrator.DEBUG) console.log('Searching for "' + query + '"');
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
    preloadImage: function(src, success, error) {
      var image = new Image();
      image.onerror = function() { return error(image) };
      image.onload = function() { return success(image) };
      image.src = src;
      // make sure the load event fires for cached images too
      if (image.complete || image.complete === undefined) {
        image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///' +
            'ywAAAAAAQABAAACAUwAOw==';
        image.src = src;
      }
    },
    /**
     * Processes the results
     */
    processSearchResults: function(results, queryId) {
      if (illustrator.DEBUG) console.log('Receiving search results');
      illustrator.distances = {};
      if (illustrator.DEBUG) console.log('Detecting faces');
      if (illustrator.DEBUG) console.log('Calculating histograms');
      for (var service in results) {
        results[service].forEach(function(item) {
          var micropostUrl = item.micropostUrl;
          // if we already have this media item, continue to the next one.
          // using the micropostUrl as id as the posterUrl isn't stable.
          if (illustrator.mediaItemUrls[micropostUrl] !== undefined) {
            return;
          }

          if (item.posterUrl === undefined) {
            alert('Undefined Poster URL');
            console.log(item);
          }
          var posterUrl = illustrator.PROXY_SERVER +
              encodeURIComponent(item.posterUrl);
          item.origin = service;

          var success = function(image) {
            image.setAttribute('class', 'photo');
            illustrator.statuses[posterUrl] = true;
            illustrator.mediaItems[posterUrl] = item;
            illustrator.mediaItemUrls[micropostUrl] = posterUrl;
            illustrator.thumbnails[posterUrl] = image;
            if (!illustrator.queries[queryId]) {
              illustrator.queries[queryId] = [posterUrl];
            } else {
              illustrator.queries[queryId].push(posterUrl);
            }
            illustrator.detectFaces(image, image.width, image.height);
            illustrator.calculateHistogram(image);
          };

          var error = function(image) {
            try {
              image.parentNode.removeChild(image);
            } catch(e) {
              // noop
            }
            delete illustrator.statuses[posterUrl];
            if (illustrator.DEBUG) console.log('Removing ' + image.src);
          };

          illustrator.preloadImage(posterUrl, success, error);
          illustrator.statuses[posterUrl] = false;
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
      if (illustrator.DEBUG) console.log('Calculating distances');
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
      if (illustrator.DEBUG) console.log('Sorting media items');

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
      illustrator.mergeClusterData();
    },
    mergeClusterData: function() {
      if (illustrator.DEBUG) console.log('Merging cluster data');
      var clusterSizes = {};
      for (var key in illustrator.clusters) {
        if (!clusterSizes[illustrator.clusters[key].length]) {
          clusterSizes[illustrator.clusters[key].length] = [key];
        } else {
          clusterSizes[illustrator.clusters[key].length].push(key);
        }
      }

      var clusterSizesKeys = Object.keys(clusterSizes).sort(function(a, b) {
        return b - a;
      });
      var i = 0;
      illustrator.ranking = {};
      illustrator.rankedClusters = {};

      var success = function(image) {
        urlsToPreload[image.src] = true;
        illustrator.images[image.src] = image;
        checkLoadStatus();
      };

      var error = function(image) {
        delete urlsToPreload[image.src];
        checkLoadStatus();
      };

      var checkLoadStatus = function() {
        for (var key in urlsToPreload) {
          if (!urlsToPreload[key]) {
            return;
          }
        }
        return illustrator.display();
      }

      var urlsToPreload = {};
      if (illustrator.DEBUG) console.log('Preloading full-size media items');
      clusterSizesKeys.forEach(function(index) {
        clusterSizes[index].forEach(function(key) {
          var likes = 0;
          var shares = 0;
          var comments = 0;
          var views = 0;
          var maxPixels = {};

          likes += illustrator.mediaItems[key].socialInteractions.likes;
          shares += illustrator.mediaItems[key].socialInteractions.shares;
          comments += illustrator.mediaItems[key].socialInteractions.comments;
          views += illustrator.mediaItems[key].socialInteractions.views;
          maxPixels = {
            url: key,
            pixels:
                illustrator.thumbnails[key].width *
                illustrator.thumbnails[key].height
          };

          illustrator.clusters[key].map(function(url) {
            likes += illustrator.mediaItems[url].socialInteractions.likes;
            shares += illustrator.mediaItems[url].socialInteractions.shares;
            comments += illustrator.mediaItems[url].socialInteractions.comments;
            views += illustrator.mediaItems[url].socialInteractions.views;
            var pixels =
                illustrator.thumbnails[url].width *
                illustrator.thumbnails[url].height;
            if (pixels >= maxPixels.pixels) {
              maxPixels = {
                url: url,
                pixels: pixels
              };
            }
          });

          var temp = illustrator.mediaItems[maxPixels.url];
          var preloadUrl = temp.type === 'photo' ?
              temp.mediaUrl : temp.posterUrl;
          urlsToPreload[preloadUrl] = false;
          illustrator.preloadImage(preloadUrl, success, error);

          illustrator.ranking[i] = key;
          illustrator.rankedClusters[key] = {
            mediaUrl: temp.mediaUrl,
            posterUrl: temp.posterUrl,
            type: temp.type,
            origin: temp.origin,
            clusterIdentifier: key,
            statistics: {
              likes: likes,
              shares: shares,
              comments: comments,
              views: views,
              maxPixels: maxPixels
            }
          };
          i++;
        });
      });
      // when no clusters, display nothing
      if (clusterSizesKeys.length === 0) {
        illustrator.display();
      }
    },
    display: function() {
      if (illustrator.DEBUG) console.log('Displaying clustered media items');

      var clusterSizes = {};
      for (var key in illustrator.clusters) {
        if (!clusterSizes[illustrator.clusters[key].length]) {
          clusterSizes[illustrator.clusters[key].length] = [key];
        } else {
          clusterSizes[illustrator.clusters[key].length].push(key);
        }
      }

      var clusterSizesKeys = Object.keys(clusterSizes).sort(function(a, b) {
        return b - a;
      });

      var faviconHtml = function(service) {
        return '<img class="favicon" src="./resources/' +
            service.toLowerCase() + '.png' + '"/>' +
            '<span class="close">X</span>';
      };

      var micropostHtml = function(url) {
        var img = illustrator.thumbnails[url];
        var width = Math.ceil(100 / img.height * img.width);
        return '<div class="micropost" style="width:' + width + 'px;">' +
            illustrator.mediaItems[url].micropost.plainText + '<hr/>' +
            '<a href="' + illustrator.mediaItems[url].micropostUrl +
            '">Permalink</a><hr/>' +
            'Likes: ' + illustrator.mediaItems[url].socialInteractions.likes +
            '<br/>' +
            'Shares: ' + illustrator.mediaItems[url].socialInteractions.shares +
            '<br/>' +
            'Comments: ' +
            illustrator.mediaItems[url].socialInteractions.comments + '<br/>' +
            'Views: ' + illustrator.mediaItems[url].socialInteractions.views +
            '<hr/>' +
            'Dimensions: ' + illustrator.thumbnails[url].width + '/' +
            illustrator.thumbnails[url].height + '<br/>' +
            'Aspect Ratio: ' + (Math.round(illustrator.thumbnails[url].width /
            illustrator.thumbnails[url].height * 100) / 100) + '<br/>' +
            'Megapixels: ' + (illustrator.thumbnails[url].width *
            illustrator.thumbnails[url].height / 1000000) +
            '</div>';
      };

      var mediaItemHtml = function(url, clusterMaxPixelsUrl) {
        var isRepresentative = '';
        if (clusterMaxPixelsUrl === url) {
          isRepresentative = ' representative';
        }
        var hasFaces = '';
        if (illustrator.faces[url].length > 0) {
          hasFaces = ' face';
        }
        return '<img class="photo' + isRepresentative + hasFaces + '" src="' +
            url + '" data-posterurl="' + url + '"/>' +
            faviconHtml(illustrator.mediaItems[url].origin) +
            micropostHtml(url);
      };

      var html = [];
      clusterSizesKeys.forEach(function(index) {
        clusterSizes[index].forEach(function(key) {
          var representativeUrl =
              illustrator.rankedClusters[key].statistics.maxPixels.url;
          html.push('<div class="cluster">' +
              '<div class="firstMediaItem mediaItem">' +
              mediaItemHtml(key, representativeUrl) +
              '</div>' +
              illustrator.clusters[key].map(function(url) {
                return '<div class="mediaItem">' +
                    mediaItemHtml(url, representativeUrl) +
                    '</div>';
              }).join('') + '</div>');
        });
      });

      var resultsDiv = document.getElementById('results');
      resultsDiv.innerHTML = html.join('');

      illustrator.rank();
    },
    rank: function() {
      if (illustrator.DEBUG) console.log('Ranking clusters');
      var mediaItems = [];
      Object.keys(illustrator.ranking).sort(function(a, b) {
        return a - b;
      }).forEach(function(i) {
        var item = illustrator.rankedClusters[illustrator.ranking[i]];
        if (item.type === 'photo') {
          var image = illustrator.images[item.mediaUrl];
          image.dataset.posterurl = item.clusterIdentifier;
          image.dataset.origin = item.origin;
          image.dataset.width = image.width;
          image.dataset.height = image.height;
          var clone = image.cloneNode();
          mediaItems.push(clone);
        } else if (item.type === 'video') {
          var video = document.createElement('video');
          video.src = item.mediaUrl;
          video.dataset.posterurl = item.clusterIdentifier;
          video.dataset.origin = item.origin;
          video.setAttribute('poster', item.posterUrl);
          video.setAttribute('controls', 'controls');
          video.setAttribute('loop', 'loop');
          var poster = illustrator.images[item.posterUrl];
          video.dataset.width = poster.width;
          video.dataset.height = poster.height;
          var clone = video.cloneNode();
          mediaItems.push(clone);
        }
      });
      illustrator.drawGallery(mediaItems);
    },
    drawGallery: function(mediaItems) {
      if (illustrator.DEBUG) console.log('Drawing media gallery');

      document.querySelector('.step2').style.display = 'block';
      document.querySelector('.step1').style.display = 'block';

      // media gallery algorithm credits to
      // http://blog.vjeux.com/2012/image/-
      // image-layout-algorithm-google-plus.html
      var heights = [];

      function run(maxHeight) {
        if (illustrator.DEBUG) console.log('Styling media gallery');
        var size = window.innerWidth - 50;

        var n = 0;
        var images = document.querySelectorAll('.gallery');
        var temp = [];
        // convert NodeList to Array
        for (var i = images.length >>> 0; i--; /* no op */) {
          temp[i] = images[i];
        }
        images = temp;
        w: while (images.length > 0) {
          for (var i = 1; i < images.length + 1; ++i) {
            var slice = images.slice(0, i);
            var h = getHeight(slice, size);
            if (h < maxHeight) {
              setHeight(slice, h);
              n++;
              images = images.slice(i);
              continue w;
            }
          }
          setHeight(slice, Math.min(maxHeight, h));
          n++;
          break;
        }
      }

      function getHeight(images, width) {
        width -= images.length * 5;
        var h = 0;
        for (var i = 0; i < images.length; ++i) {
          h += images[i].dataset.width / images[i].dataset.height;
        }
        return ~~(width / h);
      }

      function setHeight(images, height) {
        heights.push(height);
        for (var i = 0; i < images.length; ++i) {
          images[i].style.width = Math.round(height * images[i].dataset.width /
              images[i].dataset.height);
          images[i].style.height = height;
        }
      }

      (function attachMediaItems() {
        var fragment = document.createDocumentFragment();
        mediaItems.forEach(function (item) {
          var div = document.createElement('div');
          div.setAttribute('class', 'mediaItem');
          var temp = item.cloneNode();
          temp.setAttribute('class', 'gallery');
          fragment.appendChild(div);
          div.appendChild(temp);
          var favicon = document.createElement('img');
          favicon.setAttribute('class', 'favicon');
          favicon.src = './resources/' + temp.dataset.origin.toLowerCase() +
              '.png';
          div.appendChild(favicon);
          var close = document.createElement('span');
          close.setAttribute('class', 'close');
          close.innerHTML = 'X';
          div.appendChild(close);
        });
        var rankedList = document.getElementById('rankedList');
        rankedList.innerHTML = '';
        rankedList.appendChild(fragment);
        run(illustrator.MAX_LINE_HEIGHT);
      })();

      var resizeWindow = function() {
        run(illustrator.MAX_LINE_HEIGHT);
      };
      window.removeEventListener('resize', resizeWindow, false);
      window.addEventListener('resize', resizeWindow, false);
    },
    debug: function() {
      var debug = document.getElementById('debug');
      setInterval(function() {
        var html = '';
        html += 'thumbnails: ' + Object.keys(illustrator.thumbnails).length + '<br/>';

        html += 'mediaItems: ' + Object.keys(illustrator.mediaItems).length + '<br/>';
        html += 'mediaItemUrls: ' + Object.keys(illustrator.mediaItemUrls).length + '<br/>';
        html += 'statuses: ' + Object.keys(illustrator.statuses).length + '<br/>';
        html += 'tileHistograms: ' + Object.keys(illustrator.tileHistograms).length + '<br/>';
        html += 'faces: ' + Object.keys(illustrator.faces).length + '<br/>';
        html += 'distances: ' + Object.keys(illustrator.distances).length + '<hr/>';
        html += 'clusters: ' + Object.keys(illustrator.clusters).length + '<br/>';
        html += 'ranking: ' + Object.keys(illustrator.ranking).length + '<br/>';
        html += 'rankedClusters: ' + Object.keys(illustrator.rankedClusters).length + '<br/>';
        html += 'images: ' + Object.keys(illustrator.images).length + '<hr/>';
        html += 'queries: ' + Object.keys(illustrator.queries).length;
        debug.innerHTML = html;
      }, 500);
    }
  };

  // init
  illustrator.init();
})();