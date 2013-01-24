(function() {
  var illustrator = {
    // constants
    DEBUG: true,
    MEDIA_SERVER: 'http://localhost:8001/search/combined/',
    PROXY_SERVER: 'http://localhost:8001/proxy/',
    MAX_INT: 9007199254740992,

    // global state
    statusMessageTimeout: null,
    canvas: null,
    ctx: null,

    // app logic
    queries: {},
    mediaItems: {}, // the object key is always the proxied poster url
    micropostUrls: {}, // the object key is always the micropost url

    // settings
    photosOnly: false,
    cols: 10,
    rows: 10,

    init: function() {
      if (illustrator.DEBUG) console.log('Initializing app');

      var resizeTabsDiv = function() {
        var tabs = document.getElementById('tabs');
        tabs.style.minHeight = (window.innerHeight - tabs.offsetTop - 5) + 'px';
      };
      window.addEventListener('resize', resizeTabsDiv, false);
      resizeTabsDiv();

      if (illustrator.DEBUG) illustrator.debug();

      illustrator.socket = io.connect('http://localhost:8001/');
      illustrator.initSockets();

      illustrator.canvas = document.createElement('canvas');
      illustrator.canvas.width = 100;
      illustrator.canvas.height = 100;
      illustrator.ctx = illustrator.canvas.getContext('2d');

      illustrator.reset();

      var searchForm = document.getElementById('searchForm');
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var query = document.getElementById('query').value;
        illustrator.searchMediaItems(query);
      }, false);

      // reset button
      var resetButton = document.getElementById('reset');
      resetButton.addEventListener('click', function() {
        illustrator.reset();
      });

    },

    debug: function() {

    },

    initSockets: function() {
      if (illustrator.DEBUG) console.log('Initializing WebSockets');

      illustrator.socket.on('proxy', function(data) {
        illustrator.showStatusMessage('Loading file ' + data.url);
      });

      illustrator.socket.on('mediaResults', function(data) {
        illustrator.showStatusMessage('Receiving data from ' + data.service);
      });
    },

    reset: function() {
      if (illustrator.DEBUG) console.log('Resetting app');
      document.getElementById('mediaItemClusters').innerHTML = '';
      document.getElementById('queryLog').innerHTML = '';
      document.getElementById('statusMessages').innerHTML = '';
      document.getElementById('mediaGallery').innerHTML = '';
      document.getElementById('query').value = '';
      document.getElementById('tab1').checked = true;
      illustrator.statusMessageTimeout = null;
      illustrator.queries = {};
      illustrator.mediaItems = {};
      illustrator.micropostUrls = {};
    },

    showStatusMessage: function(message) {
      if (illustrator.DEBUG) console.log(message);
      var statusMessage = document.getElementById('statusMessages');
      statusMessage.innerHTML = message;
      if (illustrator.statusMessageTimeout) {
        clearTimeout(illustrator.statusMessageTimeout);
      }
      illustrator.statusMessageTimeout = setTimeout(function() {
        statusMessage.innerHTML = '';
      }, 3000);
    },

    searchMediaItems: function(query) {
      if (!query) {
        return false;
      }

      illustrator.showStatusMessage('Searching for "' + query + '"');

      var url = illustrator.MEDIA_SERVER + encodeURIComponent(query);
      var queryId = new Date().getTime();

      var handleXhrError = function(url) {
        illustrator.showStatusMessage('Error while loading ' + url);
      };
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            try {
              var results = JSON.parse(xhr.responseText);
              illustrator.retrieveMediaItems(results, queryId);
            } catch(e) {
              if (illustrator.DEBUG) console.log(e);
              handleXhrError(url);
            }
          } else {
            handleXhrError(url);
          }
        }
      };
      xhr.onerror = function() {
        handleXhrError(url);
      };
      xhr.open("GET", url, true);
      xhr.send(null);
      return false;
    },

    retrieveMediaItems: function(results, queryId) {

      illustrator.showStatusMessage('Retrieving media items');

      var checkMediaItemStatuses = function(target) {
        for (var key in illustrator.mediaItems) {
          if (illustrator.mediaItems[key].status !== target) {
            return false;
          }
        }
        return true;
      };

      var preloadImage = function(src, success, error) {
        var image = new Image();
        image.onerror = function() {
          return error(src)
        };
        image.onload = function() {
          return success(image)
        };
        image.src = src;
        // make sure the load event fires for cached images too
        if (image.complete || image.complete === undefined) {
          image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///' +
              'ywAAAAAAQABAAACAUwAOw==';
          image.src = src;
        }
      };

      var detectFaces = function(img, width, height) {
        var comp = ccv.detect_objects({
          canvas: ccv.grayscale(ccv.pre(img, width, height)),
          cascade: cascade,
          interval: 5,
          min_neighbors: 1
        });
        illustrator.mediaItems[img.src].faces = comp;
      };

      var calculateHistograms = function(img) {
        var canvasWidth = illustrator.canvas.width;
        var canvasHeight = illustrator.canvas.height;
        illustrator.ctx.clearRect (0, 0, canvasWidth, canvasHeight);
        // draw the image on the canvas
        illustrator.ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

        // calculate the histograms tile-wise
        var sw = ~~(img.width / illustrator.cols);
        var sh = ~~(img.height / illustrator.rows);
        var dw = ~~(canvasWidth / illustrator.cols);
        var dh = ~~(canvasHeight / illustrator.rows);

        illustrator.mediaItems[img.src].tileHistograms = {};
        var len = illustrator.cols * illustrator.rows;
        for (var i = 0; i < len; i++) {
          // calculate the boundaries for the current tile from the
          // image and translate it to boundaries on the main canvas
          var mod = (i % illustrator.cols);
          var div = ~~(i / illustrator.cols);
          var sx = mod * sw;
          var sy = div * sh;
          var dx = mod * dw;
          var dy = div * dh;
          // calculate the histogram of the current tile
          var histogram =
              Histogram.getHistogram(illustrator.ctx, dx, dy, dw, dh, false);
          illustrator.mediaItems[img.src].tileHistograms[i] = {
            r: histogram.pixel.r,
            g: histogram.pixel.g,
            b: histogram.pixel.b
          };
        }
      };

      var preloadFullImage = function(posterUrl, micropostUrl) {
        // for photos, load the media url as full image
        // for videos, load the (already cached) thumbnail as full image
        var mediaUrl = posterUrl;
        if (illustrator.mediaItems[posterUrl].type === 'photo') {
          mediaUrl = illustrator.mediaItems[posterUrl].mediaUrl;
        }
        illustrator.showStatusMessage('Loading file ' + mediaUrl);
        preloadImage(
            mediaUrl,
            function(image) {
              successFullImage(image, posterUrl, micropostUrl);
            },
            function(src) {
              errorFullImage(src, posterUrl);
            });
      };

      var successThumbnail = function(image, micropostUrl) {
        image.setAttribute('class', 'photo');
        illustrator.mediaItems[image.src].thumbnail = image;
        detectFaces(image, image.width, image.height);
        calculateHistograms(image);
        preloadFullImage(image.src, micropostUrl);
      };

      var errorThumbnail = function(src) {
        delete illustrator.mediaItems[src];
        if (illustrator.DEBUG) console.log('Removing ' + src);
      };

      var successFullImage = function(image, posterUrl, micropostUrl) {
        illustrator.mediaItems[posterUrl].status = 'loaded';
        illustrator.mediaItems[posterUrl].fullImage = image;
        illustrator.micropostUrls[micropostUrl] = posterUrl;
        if (!illustrator.queries[queryId]) {
          illustrator.queries[queryId] = [image.src];
        } else {
          illustrator.queries[queryId].push(image.src);
        }
        if (checkMediaItemStatuses('loaded')) {
          illustrator.calculateDistances();
        }
      };

      var errorFullImage = function(src, posterUrl) {
        delete illustrator.mediaItems[posterUrl];
        if (illustrator.DEBUG) console.log('Removing ' + posterUrl);
      };

      for (var service in results) {
        results[service].forEach(function(item) {
          if (illustrator.photosOnly) {
            if (item.type !== 'photo') {
              return;
            }
          }

          var micropostUrl = item.micropostUrl;
          // if we already have this media item, continue to the next one.
          // using the micropostUrl as id as the posterUrl isn't stable.
          if (illustrator.micropostUrls[micropostUrl] !== undefined) {
            return;
          }

          var posterUrl = illustrator.PROXY_SERVER +
              encodeURIComponent(item.posterUrl);
          item.origin = service;
          item.status = false;
          illustrator.mediaItems[posterUrl] = item;
          // load the poster url as thumbnail
          preloadImage(posterUrl, function(image) {
            successThumbnail(image, micropostUrl)
          }, errorThumbnail);
        });
      }
    },
    calculateDistances: function() {

    },
    clusterMediaItems: function() {

    },
    rankMediaItems: function() {

    },
    createClusterPreview: function() {

    },
    createMediaGallery: function() {

    }
  };

  illustrator.init();
})();