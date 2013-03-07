(function() {
  var illustrator = {
    // constants
    DEBUG: true,
    MEDIA_SERVER: 'http://localhost:8001/search/combined/',
    PROXY_SERVER: 'http://localhost:8001/proxy/',
    SPEECH_SERVER: 'http://localhost:8001/speech/',
    MAX_ROW_HEIGHT: 200,
    SIMILAR_TILES_FACTOR: 2/3,

    // global state
    canvas: null,
    ctx: null,
    statusMessagesTimeout: null,
    statusMessages: document.getElementById('statusMessages'),
    mediaGalleryResizeFunction: null,

    // app logic
    queries: {},
    micropostUrls: {}, // the object key is always the micropost url
    mediaItems: {}, // the object key is always the proxied poster url
    clusters: [],
    mediaGalleryZIndex: 1,
    mediaGalleryAlgorithm: null,
    mediaGalleryCenter: {
      top: null,
      left: null
    },

    // settings
    photosOnly: false,
    cols: 10,
    rows: 10,
    bwTolerance: 1,
    threshold: 15,
    similarTiles: 66,
    considerFaces: true,
    considerLuminance: true,
    weights: {
      likes: 2,
      shares: 4,
      comments: 8,
      views: 1,
      crossNetwork: 32,
      recency: 2
    },
    maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day
    mediaGallerySize: 25,

    init: function() {
      if (illustrator.DEBUG) console.log('Initializing app');

      var resizeTabsDiv = function() {
        var tab = document.getElementById('tabs');
        tab.style.minHeight = (window.innerHeight - tabs.offsetTop - 10) + 'px';
      };
      window.addEventListener('resize', resizeTabsDiv, false);
      resizeTabsDiv();

      var rankBySelect = document.getElementById('rankBy');
      for (var formula in illustrator.rankingFormulas) {
        var option = document.createElement('option');
        option.innerHTML = illustrator.rankingFormulas[formula].name;
        option.value = formula;
        if (formula === 'popularity') {
          option.setAttribute('selected', 'selected');
        }
        rankBySelect.appendChild(option);
      }
      rankBySelect.addEventListener('change', function() {
        illustrator.rankClusters();
      });

      var mediaGalleryAlgorithmSelect =
          document.getElementById('mediaGalleryAlgorithm');
      for (var algorithm in illustrator.mediaGalleryAlgorithms) {
        var option = document.createElement('option');
        option.innerHTML = illustrator.mediaGalleryAlgorithms[algorithm].name;
        option.value = algorithm;
        if (algorithm === 'looseOrder') {
          option.setAttribute('selected', 'selected');
          illustrator.mediaGalleryAlgorithm = algorithm;
        }
        mediaGalleryAlgorithmSelect.appendChild(option);
      }
      mediaGalleryAlgorithmSelect.addEventListener('change', function() {
        illustrator.mediaGalleryAlgorithm =
            mediaGalleryAlgorithmSelect.selectedOptions[0].value;
        illustrator.createMediaGallery();
      });

      var weightChanged = function(e) {
        illustrator.weights[e.target.name] = e.target.value;
        illustrator.rankClusters();
      };

      var likesWeight = document.getElementById('likesWeight');
      likesWeight.value = illustrator.weights.likes;
      likesWeight.addEventListener('change', weightChanged);

      var sharesWeight = document.getElementById('sharesWeight');
      sharesWeight.value = illustrator.weights.shares;
      sharesWeight.addEventListener('change', weightChanged);

      var commentsWeight = document.getElementById('commentsWeight');
      commentsWeight.value = illustrator.weights.comments;
      commentsWeight.addEventListener('change', weightChanged);

      var viewsWeight = document.getElementById('viewsWeight');
      viewsWeight.value = illustrator.weights.views;
      viewsWeight.addEventListener('change', weightChanged);

      var crossNetworkWeight = document.getElementById('crossNetworkWeight');
      crossNetworkWeight.value = illustrator.weights.crossNetwork;
      crossNetworkWeight.addEventListener('change', weightChanged);

      var recencyWeight = document.getElementById('recencyWeight');
      recencyWeight.value = illustrator.weights.recency;
      recencyWeight.addEventListener('change', weightChanged);

      var mouseover = function(e) {
        if ((e.target.nodeName.toLowerCase() !== 'img') &&
            (e.target.nodeName.toLowerCase() !== 'video') &&
            (e.target.nodeName.toLowerCase() !== 'span')) {
          return;
        };
        var img = e.target.parentNode.querySelector('img, video');
        var close = img.parentNode.parentNode.querySelector('span.close');
        close.style.display = 'block';
        if (e.target.nodeName.toLowerCase() === 'video') {
          e.target.setAttribute('controls', 'controls');
        }
      };

      var mouseout = function(e) {
        if ((e.target.nodeName.toLowerCase() !== 'img') &&
            (e.target.nodeName.toLowerCase() !== 'video') &&
            (e.target.nodeName.toLowerCase() !== 'span')) {
          return;
        };
        var img = e.target.parentNode.querySelector('img, video');
        var close = img.parentNode.parentNode.querySelector('span.close');
        close.style.display = 'none';
        if (e.target.nodeName.toLowerCase() === 'video') {
          e.target.removeAttribute('controls');
        }
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
        var cascading = true;
        if (close.parentNode.parentNode.classList.contains('cluster')) {
          cascading = false;
        };
        illustrator.deleteMediaItem(posterUrl, cascading);
      };

      var mediaItemClusters = document.getElementById('mediaItemClusters');
      var image1;
      var image2;
      mediaItemClusters.addEventListener('contextmenu', function(e) {
        if ((e.target.nodeName.toLowerCase() === 'img') &&
            (e.target.classList.contains('photo'))) {
          e.preventDefault();
          var img = e.target;
          if (!image1) {
            image1 = img;
          } else if (!image2) {
            image2 = img;
          }
          if (image1 && image2) {
            illustrator.clusterMediaItems(image1.dataset.posterurl,
                image2.dataset.posterurl);
            image1 = null;
            image2 = null;
          }
        }
      });

      mediaItemClusters.addEventListener('mouseover', function(e) {
        if ((e.target.nodeName.toLowerCase() === 'img') &&
            (e.target.classList.contains('photo'))) {
          var img = e.target;
          illustrator.calculateHistograms(img, true);
          var dataUrl = illustrator.canvas.toDataURL('image/png');
          img.style.width = img.clientWidth + 'px';
          img.style.height = img.clientHeight + 'px';
          img.src = dataUrl;
        }
      });
      mediaItemClusters.addEventListener('mouseout', function(e) {
        if ((e.target.nodeName.toLowerCase() === 'img') &&
            (e.target.classList.contains('photo'))) {
          var img = e.target;
          img.src = img.dataset.posterurl;
        }
      });
      mediaItemClusters.addEventListener('mouseover', function(e) {
        mouseover(e);
      });
      mediaItemClusters.addEventListener('mouseout', function(e) {
        mouseout(e);
      });
      mediaItemClusters.addEventListener('click', function(e) {
        click(e);
      });
      var mediaGallery = document.getElementById('mediaGallery');
      mediaGallery.addEventListener('mouseover', function(e) {
        mouseover(e);
      });
      mediaGallery.addEventListener('mouseout', function(e) {
        mouseout(e);
      });
      mediaGallery.addEventListener('click', function(e) {
        click(e);
      });

      mediaGallery.addEventListener('mouseover', function(e) {
        if ((e.target.nodeName.toLowerCase() !== 'img') &&
            (e.target.nodeName.toLowerCase() !== 'video') &&
            (e.target.nodeName.toLowerCase() !== 'span')) {
          return;
        };
        var img = e.target.parentNode.querySelector('img, video');
        var div = img.parentNode.parentNode;
        // do not trigger mouseover on clones
        if (div.classList.contains('clone')) {
          return;
        }
        // create the placeholder clone
        if (!document.getElementById(img.src)) {
          var clone = div.cloneNode(true);
          clone.classList.add('clone');
          clone.id = img.src;
          if (illustrator.mediaGalleryAlgorithm === 'looseOrder') {
            mediaGallery.insertBefore(clone, div);
          } else {
            var left = div.offsetLeft;
            var top = div.offsetTop;
            clone.setAttribute('style', 'position: absolute !important; ' +
                'left: ' + left + 'px !important; ' +
                'top: ' + top + 'px !important; ' +
                'float: none !important;');
            mediaGallery.appendChild(clone);
          }
        }
        // prepare the zoom animation and center the media item
        div.style.zIndex = illustrator.mediaGalleryZIndex++;
        var scaleFactor = '2.0';
        if (div.classList.contains('big')) {
          scaleFactor = '1.5';
        }
        div.style['-webkit-transform'] = 'scale(' + scaleFactor + ')';
        div.style.transform = 'scale(' + scaleFactor + ')';
        // needed for the CSS transition to trigger
        getComputedStyle(div).left;
        div.style.left = illustrator.mediaGalleryCenter.left - div.offsetLeft -
            (div.clientWidth / 2);
        div.style.top = illustrator.mediaGalleryCenter.top - div.offsetTop -
            (div.clientHeight / 2) + mediaGallery.scrollTop;
        // blur all other media items
        var mediaItems = mediaGallery.querySelectorAll('.mediaItem');
        for (var i = 0, len = mediaItems.length; i < len; i++) {
          if (mediaItems[i] !== div) {
            mediaItems[i].style['-webkit-filter'] = 'blur(10px)';
            mediaItems[i].style['filter'] = 'blur(10px)';
          }
        }
      });

      mediaGallery.addEventListener('mouseout', function(e) {
        if ((e.target.nodeName.toLowerCase() !== 'img') &&
            (e.target.nodeName.toLowerCase() !== 'video') &&
            (e.target.nodeName.toLowerCase() !== 'span')) {
          return;
        };
        var img = e.target.parentNode.querySelector('img, video');
        var div = img.parentNode.parentNode;
        // do not trigger mouseout on clones
        if (div.classList.contains('clone')) {
          return;
        }
        // needed for the CSS transition to trigger
        getComputedStyle(div).left;
        // scale down the media item again and put it back to its space
        div.style['-webkit-transform'] = 'scale(1.0)';
        div.style.transform = 'scale(1.0)';
        div.style.left = null;
        div.style.top = null;
        // unblur all other media items
        var mediaItems = mediaGallery.querySelectorAll('.mediaItem');
        for (var i = 0, len = mediaItems.length; i < len; i++) {
          if (mediaItems[i] !== div) {
            mediaItems[i].style['-webkit-filter'] = null;
            mediaItems[i].style['filter'] = null;
          }
        }
        // remove the clone, but only when the scale down animation has finished
        var removeClone = function(transEvent) {
          if ((transEvent.propertyName === '-webkit-transform') ||
              (transEvent.propertyName === 'transform')) {
            if ((div.style['-webkit-transform'] === 'scale(1)') ||
                (div.style.transform === 'scale(1)')) {
              div.style.zIndex = 1;
              var clone = document.getElementById(img.src);
              if (clone) {
                mediaGallery.removeChild(clone);
              }
            }
          }
        };
        // remove the clone, but only when the scale down animation has finished
        div.addEventListener('webkitTransitionEnd', removeClone);
        div.addEventListener('transitionend', removeClone);
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

      var mediaGallerySize = document.getElementById('mediaGallerySize');
      var mediaGallerySizeLabel =
          document.getElementById('mediaGallerySizeLabel');
      mediaGallerySize.min = 5;
      mediaGallerySize.max = 100;
      mediaGallerySize.value = illustrator.mediaGallerySize;
      mediaGallerySizeLabel.innerHTML = illustrator.mediaGallerySize;
      mediaGallerySize.addEventListener('change', function() {
        mediaGallerySizeLabel.innerHTML = mediaGallerySize.value;
      });
      mediaGallerySize.addEventListener('mouseup', function() {
        illustrator.mediaGallerySize = mediaGallerySize.value;
        illustrator.createMediaGallery();
      });

      var maxAge = document.getElementById('maxAge');
      maxAge.max = 7 * 24 * 60 * 60 * 1000; // 7 days
      maxAge.min = 1 * 60 * 1000; // 1 minute
      maxAge.value = illustrator.maxAge;
      var maxAgeLabel = document.getElementById('maxAgeLabel');
      maxAgeLabel.innerHTML = humaneDate(new Date((new Date().getTime() -
          maxAge.value)));
      maxAge.addEventListener('change', function() {
        maxAgeLabel.innerHTML = humaneDate(new Date((new Date().getTime() -
            maxAge.value)));
      });
      maxAge.addEventListener('mouseup', function() {
        illustrator.maxAge = maxAge.value;
        illustrator.filterForMaxAge();
      });

      var threshold = document.getElementById('threshold');
      threshold.value = illustrator.threshold;
      var thresholdLabel = document.getElementById('thresholdLabel');
      thresholdLabel.innerHTML = threshold.value;
      threshold.addEventListener('change', function() {
        thresholdLabel.innerHTML = threshold.value;
      });
      threshold.addEventListener('mouseup', function() {
        illustrator.threshold = threshold.value;
        illustrator.clusterMediaItems();
      });

      var similarTiles = document.getElementById('similarTiles');
      similarTiles.min = illustrator.calculateMinimumSimilarTiles();
      similarTiles.max = illustrator.rows * illustrator.cols;
      similarTiles.value = illustrator.calculateSimilarTiles();
      illustrator.similarTiles = similarTiles.value;
      var similarTilesLabel =
          document.getElementById('similarTilesLabel');
      similarTilesLabel.innerHTML = similarTiles.value;
      similarTiles.addEventListener('change', function() {
        similarTilesLabel.innerHTML = similarTiles.value;
      });
      similarTiles.addEventListener('mouseup', function() {
        illustrator.similarTiles = similarTiles.value;
        illustrator.clusterMediaItems();
      });

      var bwTolerance = document.getElementById('bwTolerance');
      bwTolerance.max = 10;
      bwTolerance.min = 0;
      bwTolerance.value = illustrator.bwTolerance;
      var bwToleranceLabel =
          document.getElementById('bwToleranceLabel');
      bwToleranceLabel.innerHTML = bwTolerance.value;
      bwTolerance.addEventListener('change', function() {
        bwToleranceLabel.innerHTML = bwTolerance.value;
      });
      bwTolerance.addEventListener('mouseup', function() {
        illustrator.bwTolerance = bwTolerance.value;
        illustrator.calculateDistances();
      });

      var rows = document.getElementById('rows');
      rows.value = illustrator.rows;
      rows.max = 50;
      rows.min = 1;
      var rowsLabel = document.getElementById('rowsLabel');
      rowsLabel.innerHTML = rows.value;
      rows.addEventListener('change', function() {
        rowsLabel.innerHTML = rows.value;
      });

      var cols = document.getElementById('cols');
      cols.value = illustrator.cols;
      cols.max = 50;
      cols.min = 1;
      var colsLabel = document.getElementById('colsLabel');
      colsLabel.innerHTML = cols.value;
      cols.addEventListener('change', function() {
        colsLabel.innerHTML = cols.value;
      });

      var rowsColsChange = function() {
        illustrator.rows = rows.value;
        illustrator.cols = cols.value;
        similarTiles.min = illustrator.calculateMinimumSimilarTiles();
        similarTiles.max = illustrator.rows * illustrator.cols;
        similarTiles.value = illustrator.calculateSimilarTiles();
        illustrator.similarTiles = similarTiles.value;
        similarTilesLabel.innerHTML = similarTiles.value;
        for (var key in illustrator.mediaItems) {
          var mediaItem = illustrator.mediaItems[key];
          illustrator.calculateHistograms(mediaItem.thumbnail);
        }
        illustrator.calculateDistances();
      };
      rows.addEventListener('mouseup', rowsColsChange);
      cols.addEventListener('mouseup', rowsColsChange);

      var faces = document.getElementById('faces');
      faces.checked = illustrator.considerFaces;
      faces.addEventListener('change', function() {
        illustrator.considerFaces = faces.checked;
        illustrator.clusterMediaItems();
      });

      var luminance = document.getElementById('luminance');
      luminance.checked = illustrator.considerLuminance;
      luminance.addEventListener('change', function() {
        illustrator.considerLuminance = luminance.checked;
        illustrator.calculateDistances();
      });

      var searchForm = document.getElementById('searchForm');
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var query = document.getElementById('query').value;
        illustrator.searchMediaItems(query);
      }, false);

      var queryLogDiv = document.getElementById('queryLog');
      queryLog.addEventListener('click', function(e) {
        if ((e.target.nodeName.toLowerCase() === 'input') ||
            (e.target.nodeName.toLowerCase() === 'label')) {
          // can use checkbox, even if the label was clicked
          var target = e.target;
          var queryId = target.parentNode.getElementsByTagName('label')[0]
              .getAttribute('for');
          var checkbox = target.parentNode.getElementsByTagName('input')[0];
          var displayState;
          if (checkbox.checked) {
            displayState = 'inline';
          } else {
            displayState = 'none';
          }
          var sources = illustrator.queries[queryId].forEach(function(source) {
            var images = document.querySelectorAll('img[src="' + source + '"]');
            for (var i = 0, len = images.length; i < len; i++) {
              images[i].parentNode.parentNode.style.display = displayState;
            }
          });
        }
      });

      var mediaGalleryTab = document.getElementById('tab2');
      mediaGalleryTab.addEventListener('click', function() {
        illustrator.createMediaGallery();
      });

      // whenever we don't look at the media gallery, make it empty
      var mediaClustersTab = document.getElementById('tab1');
      mediaClustersTab.addEventListener('click', function() {
        var mediaGallery = document.getElementById('mediaGallery');
        mediaGallery.innerHTML = '';
      });

      // reset button
      var resetButton = document.getElementById('reset');
      resetButton.addEventListener('click', function() {
        illustrator.reset();
      });

      if (illustrator.DEBUG) illustrator.debug();

      illustrator.socket = io.connect('http://localhost:8001/');
      illustrator.initSockets();

      illustrator.canvas = document.createElement('canvas');
      illustrator.canvas.width = 100;
      illustrator.canvas.height = 100;
      illustrator.ctx = illustrator.canvas.getContext('2d');

      illustrator.reset();
    },

    debug: function() {

    },

    deleteMediaItem: function(posterUrl, cascading) {
      var deleteIndividualMediaItem = function(individualPosterUrl) {
        // delete the corresponding micropost
        var micropostUrl =
            illustrator.mediaItems[individualPosterUrl].micropostUrl;
        delete illustrator.micropostUrls[micropostUrl];

        // delete the media item itself
        delete illustrator.mediaItems[individualPosterUrl];

        // delete the media item from all distances
        for (var key in illustrator.mediaItems) {
          delete illustrator.mediaItems[key].distances[individualPosterUrl];
        }

        // delete the media item from all queries
        for (var key in illustrator.queries) {
          for (var i = 0, len = illustrator.queries[key].length; i < len; i++) {
            if (illustrator.queries[key][i] === individualPosterUrl) {
              illustrator.queries[key].splice(i, 1);
              break;
            }
          }
        }
      };

      for (var i = 0, len = illustrator.clusters.length; i < len; i++) {
        var cluster = illustrator.clusters[i];
        // if cascading, we can delete the entire cluster
        if (cascading) {
          if (cluster.identifier === posterUrl) {
            cluster.members.forEach(function(member) {
              deleteIndividualMediaItem(member);
            });
            illustrator.clusters.splice(i, 1);
            break;
          }
        // else we need to find the cluster the media item is in
        } else {
          // the media item can either be a cluster of its own
          if (cluster.identifier === posterUrl) {
            // we can delete the entire cluster, as it has no members
            if (cluster.members.length === 0) {
              illustrator.clusters.splice(i, 1);
              break;
            // we need to find a new cluster identifier within all members
            } else {
              var dimensions = -1;
              var timestamp = Infinity;
              var maxDimensionsIndex = -1;
              cluster.members.forEach(function(member, index) {
                var mediaItem = illustrator.mediaItems[member];
                var newDimensions = illustrator.calculateDimensions(mediaItem);
                if (newDimensions >= dimensions) {
                  dimensions = newDimensions;
                  maxDimensionsIndex = index;
                }
                if (mediaItem.timestamp < timestamp) {
                  timestamp = mediaItem.timestamp;
                }
              });
              cluster.identifier = cluster.members[maxDimensionsIndex];
              cluster.timestamp = timestamp;
              cluster.members.splice(maxDimensionsIndex, 1);
            }
          }
          // or it can be in another cluster
          var index = cluster.members.indexOf(posterUrl);
          if (index !== -1) {
            cluster.members.splice(index, 1);
            break;
          }
        }
      }
      deleteIndividualMediaItem(posterUrl);
      illustrator.mergeClusterData();
    },

    initSockets: function() {
      if (illustrator.DEBUG) console.log('Initializing WebSockets');

      illustrator.socket.on('proxy', function(data) {
        illustrator.showStatusMessage('Proxying file ' + data.url);
      });

      illustrator.socket.on('mediaResults', function(data) {
        illustrator.showStatusMessage('Receiving data from ' + data.service);
      });
    },

    reset: function() {
      if (illustrator.DEBUG) console.log('Resetting app');
      document.getElementById('mediaItemClusters').innerHTML = '';
      document.getElementById('queryLog').innerHTML = '';
      document.getElementById('statistics').innerHTML = '';
      document.getElementById('mediaGallery').innerHTML = '';
      document.getElementById('query').value = '';
      document.getElementById('tab1').checked = true;
      illustrator.statusMessages.innerHTML = '';
      illustrator.statusMessagesTimeout = null;
      illustrator.queries = {};
      illustrator.mediaItems = {};
      illustrator.micropostUrls = {};
      illustrator.clusters = [];
      illustrator.mediaGalleryZIndex = 1;
    },

    showStatusMessage: function(message) {
      if (illustrator.DEBUG) console.log(message);
      illustrator.statusMessages.innerHTML = message;
      if (illustrator.statusMessagesTimeout) {
        clearTimeout(illustrator.statusMessagesTimeout);
        illustrator.statusMessagesTimeout = null;
      }
      illustrator.statusMessagesTimeout = setTimeout(function() {
        illustrator.statusMessages.innerHTML = '';
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
              illustrator.retrieveMediaItems(results, query, queryId);
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

    calculateHistograms: function(img, opt_debug) {
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
        if (opt_debug) {
          illustrator.ctx.fillStyle = 'rgb(' + histogram.pixel.r + ',' +
              histogram.pixel.g + ',' + histogram.pixel.b + ')';
          illustrator.ctx.fillRect(dx, dy, dw, dh);
        }
        illustrator.mediaItems[img.src].tileHistograms[i] = {
          r: histogram.pixel.r,
          g: histogram.pixel.g,
          b: histogram.pixel.b
        };
      }
    },

    retrieveMediaItems: function(results, query, queryId) {

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
        illustrator.mediaItems[image.src].thumbnail = image;
        detectFaces(image, image.width, image.height);
        illustrator.calculateHistograms(image);
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
          illustrator.queries[queryId] = [posterUrl];
        } else {
          illustrator.queries[queryId].push(posterUrl);
        }
        if (checkMediaItemStatuses('loaded')) {
          illustrator.calculateDistances();
        }
      };

      var errorFullImage = function(src, posterUrl) {
        delete illustrator.mediaItems[posterUrl];
        if (illustrator.DEBUG) console.log('Removing ' + posterUrl);
      };

      // assume the worst, set false once we have at least one result
      var numResults = 0;
      for (var service in results) {
        results[service].forEach(function(item) {
          if (illustrator.photosOnly) {
            if (item.type !== 'photo') {
              return;
            }
          }
          numResults++;
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
          item.considerMediaItem = true;
          illustrator.mediaItems[posterUrl] = item;
          // load the poster url as thumbnail
          preloadImage(posterUrl, function(image) {
            successThumbnail(image, micropostUrl)
          }, errorThumbnail);
        });
      }
      if (numResults === 0) {
        illustrator.showStatusMessage('No results for "' + query + '"')
      } else {
        var queryLogDiv = document.getElementById('queryLog');
        queryLogDiv.innerHTML += '' +
            '<div class="queryLog">' +
              '<input type="checkbox" checked="checked" ' + 'id="' +
                  queryId + '">' +
              '<label for="' + queryId + '"><strong>' + query + '</strong> ' +
                  '(' + numResults + ' Results)</label>' +
            '</div>';
      }
    },
    calculateDistances: function() {
      illustrator.showStatusMessage('Calculating distances');

      var keys = Object.keys(illustrator.mediaItems);
      var len = keys.length;
      var abs = Math.abs;

      // reset distances
      for (var i = 0; i < len; i++) {
        illustrator.mediaItems[keys[i]].distances = {};
      }

      if (illustrator.accountForLuminance) {
        var rFactor = 0.3;
        var gFactor = 0.59;
        var bFactor = 0.11;
      } else {
        var rFactor = 1;
        var gFactor = 1;
        var bFactor = 1;
      }

      var blackTolerance = illustrator.bwTolerance;
      var whiteTolerance = 255 - illustrator.bwTolerance;

      for (var i = 0; i < len; i++) {
        var outer = keys[i];
        illustrator.mediaItems[outer].distances = {};
        var outerHisto = illustrator.mediaItems[outer].tileHistograms;
        for (var j = 0; j < len; j++) {
          if (j === i) continue;
          var inner = keys[j];
          var innerHisto = illustrator.mediaItems[inner].tileHistograms;
          illustrator.mediaItems[outer].distances[inner] = {};
          // recycle because of symmetry of distances:
          // dist(A<=>B) =  dist(B<=>A)
          if ((illustrator.mediaItems[inner].distances) &&
              (illustrator.mediaItems[inner].distances[outer])) {
            illustrator.mediaItems[outer].distances[inner] =
                illustrator.mediaItems[inner].distances[outer];
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
                illustrator.mediaItems[outer].distances[inner][k] =
                    ~~((abs(rFactor * (innerR - outerR)) +
                        abs(gFactor * (innerG - outerG)) +
                        abs(bFactor * (innerB - outerB))) / 3);
              } else {
                illustrator.mediaItems[outer].distances[inner][k] = null;
              }
            }
          }
        }
      }
      illustrator.filterForMaxAge();
    },
    filterForMaxAge: function() {
      illustrator.showStatusMessage('Filtering media items for maximum age');

      var now = new Date().getTime();
      for (var key in illustrator.mediaItems) {
        var mediaItem = illustrator.mediaItems[key];
        if (mediaItem.timestamp > now) {
          mediaItem.considerMediaItem = false;
        }
        else if (now - mediaItem.timestamp <= illustrator.maxAge) {
          mediaItem.considerMediaItem = true;
        } else {
          mediaItem.considerMediaItem = false;
        }
      }
      illustrator.clusterMediaItems();
    },
    calculateMinimumSimilarTiles: function() {
      return Math.ceil(illustrator.rows * illustrator.cols / 3);
    },
    calculateSimilarTiles: function() {
      return Math.ceil(illustrator.rows * illustrator.cols *
          illustrator.SIMILAR_TILES_FACTOR);
    },
    calculateDimensions: function(mediaItem) {
      // always prefer video over photo, so set the dimensions of videos
      // to Infinity, which overrules even high-res photos
      return (mediaItem.type === 'video' ?
          Infinity : mediaItem.fullImage.width * mediaItem.fullImage.height);
    },
    clusterMediaItems: function(opt_outer, opt_inner) {
      illustrator.showStatusMessage('Clustering media items');

      var debugOnly = opt_outer && opt_inner ? true : false;
      var keys;
      if (!debugOnly) {
        illustrator.clusters = [];
        // filter to only consider the, well, considered media items
        keys = Object.keys(illustrator.mediaItems).filter(function(key) {
          return illustrator.mediaItems[key].considerMediaItem;
        });
        if (illustrator.DEBUG) console.log(
            Object.keys(illustrator.mediaItems).length +
            ' media items in total, considering ' + keys.length + ' of them');
      } else {
        keys = [opt_outer, opt_inner];
      }
      var len = keys.length;
      var abs = Math.abs;
      var max = Math.max;
      var minimumSimilarTiles = illustrator.calculateMinimumSimilarTiles();
      // the actual clustering
      for (var i = 0; i < len; i++) {
        if (!keys[i]) continue;
        var outer = keys[i];
        keys[i] = false;
        var distanceToOuter = {};
        for (var j = 0; j < len; j++) {
          if (j === i) {
            continue;
          }
          var inner = keys[j];
          var similarTiles = 0;
          var nulls = 0;
          var distance = illustrator.mediaItems[outer].distances[inner];
          for (var k in distance) {
            if (distance[k] !== null) {
              if (distance[k] <= illustrator.threshold) {
                similarTiles++;
              }
            } else {
              nulls++;
            }
          }
          var minimumRequired;
          var similarTilesWithoutNulls = illustrator.similarTiles - nulls;
          if (similarTilesWithoutNulls >= minimumSimilarTiles) {
            minimumRequired = similarTilesWithoutNulls;
          } else {
            minimumRequired = minimumSimilarTiles;
          }
          if (similarTiles >= minimumRequired) {
            if (illustrator.considerFaces) {
              var outerFaces = illustrator.mediaItems[outer].faces.length;
              var innerFaces = illustrator.mediaItems[inner].faces.length;
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
        var members = [];
        Object.keys(distanceToOuter).sort(function(a, b) {
          return b - a;
        }).forEach(function(numSimilarTiles) {
          distanceToOuter[numSimilarTiles].forEach(function(key) {
            members.push(keys[key]);
            keys[key] = false;
          });
        });
        if (!debugOnly) {
          illustrator.clusters.push({
            identifier: outer,
            members: members
          });
        } else {
          if (debugOnly) {
            if (illustrator.DEBUG) console.log('Similar tiles: ' +
                similarTiles + '\nMinimum required: ' + minimumRequired +
                '\nOverall: ' + (illustrator.cols * illustrator.rows) +
                '\nNulls: ' + nulls + '\nPercent: ' +
                ((similarTiles / (illustrator.cols * illustrator.rows)) * 100) +
                '%');
illustrator.speak(                'Similar tiles: ' +
                    similarTiles + '\nMinimum required: ' + minimumRequired +
                    '\nOverall: ' + (illustrator.cols * illustrator.rows) +
                    '\nNulls: ' + nulls + '\nPercent: ' +
                    ((similarTiles / (illustrator.cols * illustrator.rows)) * 100) +
                    '%');
          }
          return;
        }
      }

      illustrator.displayClusterStatistics();

      illustrator.mergeClusterData();
    },
    displayClusterStatistics: function() {
      var numClusters = illustrator.clusters.length;
      var numMediaItems = 0;
      var clusterStatistics = {};
      illustrator.clusters.forEach(function(cluster) {
        var clusterSize = cluster.members.length + 1;
        numMediaItems += clusterSize;
        if (clusterStatistics[clusterSize]) {
          clusterStatistics[clusterSize]++;
        } else {
          clusterStatistics[clusterSize] = 1;
        }
      });
      var html = '<small><strong>Media Items:</strong> ' + numMediaItems;
      html += '<br/><strong>Clusters:</strong> ' + numClusters + '<br/>';
      Object.keys(clusterStatistics).sort(function(a, b) {
        return b - a;
      }).forEach(function(size) {
        html += ' <strong>Clusters with ' + size +
            ' Members:</strong> ' + clusterStatistics[size] + '<br/>';
      });
      html += '</small>';
      document.getElementById('statistics').innerHTML = html;
    },
    mergeClusterData: function() {
      illustrator.showStatusMessage('Merging cluster data');

      illustrator.clusters.forEach(function(cluster) {
        var mediaItem = illustrator.mediaItems[cluster.identifier];
        var socialInteractions = mediaItem.socialInteractions;
        var likes = socialInteractions.likes;
        var shares = socialInteractions.shares;
        var comments = socialInteractions.comments;
        var views = socialInteractions.views;
        cluster.statistics = {
          likes: likes,
          shares: shares,
          comments: comments,
          views: views
        };
        cluster.timestamp = mediaItem.timestamp;
        var dimensions = illustrator.calculateDimensions(mediaItem);

        cluster.members.forEach(function(url, i) {
          var member = illustrator.mediaItems[url];
          var memberSocialInteractions = member.socialInteractions;
          likes += memberSocialInteractions.likes;
          shares += memberSocialInteractions.shares;
          comments += memberSocialInteractions.comments;
          views += memberSocialInteractions.views;
          var newDimensions = illustrator.calculateDimensions(member);
          // we have a new cluster identifier
          if (newDimensions >= dimensions) {
            dimensions = newDimensions;
            var oldIdentifier = cluster.identifier;
            cluster.identifier = url;
            cluster.members[i] = oldIdentifier;
          }
          // always use the youngest cluster member's timestamp
          if (member.timestamp < cluster.timestamp) {
            cluster.timestamp = member.timestamp;
          }
        });
        cluster.statistics = {
          likes: likes,
          shares: shares,
          comments: comments,
          views: views
        };
      });
      illustrator.rankClusters();
    },
    rankingFormulas: {
      crossNetwork: {
        name: 'Cross-Network',
        func: function(a, b) {
          return b.members.length - a.members.length;
        }
      },

      age: {
        name: 'Age',
        func: function(a, b) {
          return b.timestamp - a.timestamp;
        }
      },

      popularity: {
        name: 'Popularity',
        func: function(a, b) {
          var now = new Date().getTime();
          var getAgeFactor = function(timestamp) {
            /* 86400000 = 24 * 60 * 60 * 1000 */
            var ageInDays = Math.floor((now - timestamp) / 86400000);
            if (ageInDays <= 1) {
              return 8;
            } else if (ageInDays <= 2) {
              return 4;
            } else if (ageInDays <= 3) {
              return 2
            } else {
              return 1;
            }
          };
          var weights = illustrator.weights;
          var combinedStatsA =
              weights.likes * a.statistics.likes +
              weights.shares * a.statistics.shares +
              weights.comments * a.statistics.comments +
              weights.views * a.statistics.views +
              weights.crossNetwork * a.members.length +
              weights.recency * getAgeFactor(a.timestamp);
          var combinedStatsB =
              weights.likes * b.statistics.likes +
              weights.shares * b.statistics.shares +
              weights.comments * b.statistics.comments +
              weights.views * b.statistics.views +
              weights.crossNetwork * b.members.length +
              weights.recency * getAgeFactor(b.timestamp);
          return combinedStatsB - combinedStatsA;
        }
      },

      likes: {
        name: 'Likes',
        func: function(a, b) {
          return b.statistics.likes - a.statistics.likes;
        }
      },

      shares: {
        name: 'Shares',
        func: function(a, b) {
          return b.statistics.shares - a.statistics.shares;
        }
      },

      comments: {
        name: 'Comments',
        func: function(a, b) {
          return b.statistics.comments - a.statistics.comments;
        }
      },

      views: {
        name: 'Views',
        func: function(a, b) {
          return b.statistics.views - a.statistics.views;
        }
      }
    },
    rankClusters: function() {
      var rankBySelect = document.getElementById('rankBy');
      var formula = rankBySelect.selectedOptions[0].value;
      illustrator.showStatusMessage('Ranking clusters by ' + formula);
      illustrator.clusters.sort(illustrator.rankingFormulas[formula].func);

      illustrator.createClusterPreview();
    },
    createClusterPreview: function() {
      illustrator.showStatusMessage('Creating cluster preview');

      var getMediaItemHtml = function(mediaItem, opt_isLast) {
        var lastMediaItem = opt_isLast ? ' lastMediaItem' : '';
        var hasFaces = mediaItem.faces.length ? ' face' : '';
        var url = illustrator.PROXY_SERVER +
            encodeURIComponent(mediaItem.posterUrl);
        var micropostWidth = Math.ceil(100 / mediaItem.thumbnail.height *
            mediaItem.thumbnail.width) + 'px;';
        var service = mediaItem.origin.toLowerCase() + '.png';
        return '' +
            '<div class="mediaItem' + lastMediaItem + '">' +
              '<a target="_newtab" href="' + mediaItem.micropostUrl + '">' +
                '<img class="photo photoBorder' + hasFaces +
                    '" src="' + url + '" data-posterurl="' + url + '"/>' +
              '</a>' +
              '<img class="favicon" src="./resources/' + service + '"/>' +
              '<span class="close">X</span>' +
              '<div class="micropost" style="width:' + micropostWidth + '">' +
                mediaItem.micropost.plainText +
                '<hr/>' +
                'Age: ' + humaneDate(new Date(mediaItem.timestamp)) +
                    ' ago<br/>' +
                'Likes: ' + mediaItem.socialInteractions.likes + '<br/>' +
                'Shares: ' + mediaItem.socialInteractions.shares + '<br/>' +
                'Comments: ' + mediaItem.socialInteractions.comments + '<br/>' +
                'Views: ' + mediaItem.socialInteractions.views + '<br/>' +
                'Aspect Ratio: ' + (Math.round(mediaItem.fullImage.width /
                    mediaItem.fullImage.height * 100) / 100) + '<br/>' +
                'Megapixels: ' + (Math.round(mediaItem.fullImage.width *
                    mediaItem.fullImage.height / 1000000 * 100) / 100) +
              '</div>' +
            '</div>';
      };

      var getClusterHtml = function(mediaItemHtml) {
        return '' +
            '<div class="cluster">' +
              mediaItemHtml +
            '</div>';
      };

      var html = '';
      illustrator.clusters.forEach(function(cluster) {
        var mediaItemHtml = '';
        var mediaItem = illustrator.mediaItems[cluster.identifier];
        var length = cluster.members.length - 1;
        mediaItemHtml += getMediaItemHtml(mediaItem, length === -1);

        cluster.members.forEach(function(url, i) {
          var member = illustrator.mediaItems[url];
          mediaItemHtml += getMediaItemHtml(member, i === length);
        });
        html += getClusterHtml(mediaItemHtml);
      });

      var mediaItemClusters = document.getElementById('mediaItemClusters');
      mediaItemClusters.innerHTML = html;

      var mediaGalleryTab = document.getElementById('tab2');
      if (mediaGalleryTab.checked) {
        illustrator.createMediaGallery();
      }
    },
    mediaGalleryAlgorithms: {
      strictOrder: {
        name: 'Strict order, equal size',
        func: function(mediaItems) {
          // media gallery algorithm credits to
          // http://blog.vjeux.com/2012/image/-
          // image-layout-algorithm-google-plus.html
          var heights = [];

          var calculateSizes = function(images) {
            var size = mediaGallery.clientWidth - 20;
            var n = 0;
            w: while (images.length > 0) {
              for (var i = 1; i < images.length + 1; ++i) {
                var slice = images.slice(0, i);
                var h = getHeight(slice, size);
                if (h < illustrator.MAX_ROW_HEIGHT) {
                  setHeight(slice, h);
                  n++;
                  images = images.slice(i);
                  continue w;
                }
              }
              setHeight(slice, Math.min(illustrator.MAX_ROW_HEIGHT, h));
              n++;
              break;
            }
          };

          var getHeight = function(images, width) {
            width -= images.length * 4;
            var h = 0;
            for (var i = 0; i < images.length; ++i) {
              h += images[i].dataset.width / images[i].dataset.height;
            }
            return (width / h);
          };

          var setHeight = function(images, height) {
            heights.push(height);
            for (var i = 0; i < images.length; ++i) {
              var width = (height * images[i].dataset.width /
                  images[i].dataset.height);
              images[i].style.width = width;
              images[i].style.height = height;
              images[i].parentNode.parentNode.style.width = width;
              images[i].parentNode.parentNode.style.height = height;
            }
          };

          var fragment = document.createDocumentFragment();
          mediaItems.forEach(function(item) {
            var div = document.createElement('div');
            fragment.appendChild(div);
            div.classList.add('mediaItem');
            div.classList.add('photoBorder');
            var anchor = document.createElement('a');
            anchor.href = item.dataset.microposturl;
            anchor.setAttribute('target', '_newtab');
            anchor.appendChild(item);
            div.appendChild(anchor);
            var favicon = document.createElement('img');
            favicon.classList.add('favicon');
            favicon.src = './resources/' + item.dataset.origin.toLowerCase() +
                '.png';
            div.appendChild(favicon);
            var close = document.createElement('span');
            close.classList.add('close');
            close.innerHTML = 'X';
            div.appendChild(close);
          });
          var mediaGallery = document.getElementById('mediaGallery');
          mediaGallery.innerHTML = '';
          mediaGallery.appendChild(fragment);
          calculateSizes(mediaItems);

          window.removeEventListener('resize',
              illustrator.mediaGalleryResizeFunction);
          illustrator.mediaGalleryResizeFunction = function() {
            calculateSizes(mediaItems);
            illustrator.calculateMediaGalleryCenter();
          };
          window.addEventListener('resize',
              illustrator.mediaGalleryResizeFunction);
        }
      },
      looseOrder: {
        name: 'Loose order, varying size',
        func: function(mediaItems) {
          // media gallery algorithm credits to
          // http://blog.vjeux.com/2012/image/-
          // image-layout-algorithm-facebook.html
          var heights = [];
          var columnSize = illustrator.MAX_ROW_HEIGHT;
          var dimensions = columnSize * columnSize;
          var margin = 4;

          var createColumns = function(n) {
            heights = [];
            for (var i = 0; i < n; ++i) {
              heights.push(0);
            }
          };

          var getMinColumn = function() {
            var minHeight = Infinity;
            var iMin = -1;
            for (var i = 0; i < heights.length; ++i) {
              if (heights[i] < minHeight) {
                minHeight = heights[i];
                iMin = i;
              }
            }
            return iMin;
          };

          var addColumnElem = function(i, elem, isBig) {
            elem.style.marginLeft = margin + (columnSize + margin) * i;
            elem.style.marginTop = heights[Math.floor(i / 2)] *
                (columnSize + margin);
            var width = isBig ? columnSize * 2 + margin : columnSize;
            var height = isBig ? columnSize * 2 + margin : columnSize;
            elem.style.width = width;
            elem.style.height = height;
            if (isBig) {
              elem.classList.add('big');
            }
            var mediaItem = elem.firstChild.firstChild;
            var mediaItemWidth = parseInt(mediaItem.dataset.width, 10);
            var mediaItemHeight = parseInt(mediaItem.dataset.height, 10);
            var aspectRatio = mediaItemWidth / mediaItemHeight;
            var min = Math.min(mediaItemHeight, mediaItemWidth);
            if (min === mediaItemWidth) {
              mediaItem.style.width = width;
              mediaItem.style.height = width / aspectRatio;
            } else {
              mediaItem.style.height = height;
              mediaItem.style.width = height * aspectRatio;
            }
          };

          var calculateSizes = function(images) {
            var size = mediaGallery.clientWidth - 20;
            var nColumns = Math.floor(size / (2 * (columnSize + margin)));
            createColumns(nColumns);

            var smallImages = [];
            for (var i = 0; i < images.length; ++i) {
              var image = images[i];
              var column = getMinColumn();
              if ((image.dataset.width * image.dataset.height > dimensions) &&
                  (Math.random() > 0.5)) {
                addColumnElem(column * 2, image, true);
                heights[column] += 2;
              } else {
                smallImages.push(image);
                if (smallImages.length === 2) {
                  addColumnElem(column * 2, smallImages[0], false);
                  addColumnElem(column * 2 + 1, smallImages[1], false);
                  heights[column] += 1;
                  smallImages = [];
                }
              }
            }
            if (smallImages.length) {
              column = getMinColumn();
              addColumnElem(column * 2, smallImages[0], false);
            }
          };

          var fragment = document.createDocumentFragment();
          var divs = [];
          mediaItems.forEach(function(item) {
            var div = document.createElement('div');
            div.classList.add('mediaItem');
            div.style.position = 'absolute';
            div.style.overflow = 'hidden';
            div.dataset.width = item.dataset.width;
            div.dataset.height = item.dataset.height;
            div.classList.add('photoBorder');

            var anchor = document.createElement('a');
            anchor.href = item.dataset.microposturl;
            anchor.setAttribute('target', '_newtab');
            div.appendChild(anchor);
            anchor.appendChild(item);

            var favicon = document.createElement('img');
            favicon.classList.add('favicon');
            favicon.src = './resources/' + item.dataset.origin.toLowerCase() +
                '.png';
            div.appendChild(favicon);

            var close = document.createElement('span');
            close.classList.add('close');
            close.innerHTML = 'X';
            div.appendChild(close);
            fragment.appendChild(div);
            divs.push(div);
          });
          var mediaGallery = document.getElementById('mediaGallery');
          mediaGallery.innerHTML = '';
          mediaGallery.appendChild(fragment);
          calculateSizes(divs);

          window.removeEventListener('resize',
              illustrator.mediaGalleryResizeFunction);
          illustrator.mediaGalleryResizeFunction = function() {
            calculateSizes(divs);
            illustrator.calculateMediaGalleryCenter();
          };
          window.addEventListener('resize',
              illustrator.mediaGalleryResizeFunction);
        }
      }
    },
    createMediaGallery: function() {
      illustrator.mediaGalleryZIndex = 1;
      var mediaItems = [];
      illustrator.clusters.forEach(function(cluster, counter) {
        if (counter >= illustrator.mediaGallerySize) {
          return;
        }
        var mediaItem = illustrator.mediaItems[cluster.identifier];
        var item;
        if (mediaItem.type === 'photo') {
          item = mediaItem.fullImage;
        } else {
          item = document.createElement('video');
          item.src = mediaItem.mediaUrl;
          item.setAttribute('poster', mediaItem.posterUrl);
          item.setAttribute('loop', 'loop');
        }
        item.dataset.posterurl = cluster.identifier;
        item.dataset.width = mediaItem.fullImage.width;
        item.dataset.height = mediaItem.fullImage.height;
        item.dataset.origin = mediaItem.origin;
        item.dataset.microposturl = mediaItem.micropostUrl;
        item.classList.add('gallery');
        mediaItems.push(item);
      });

      var algorithm = illustrator.mediaGalleryAlgorithm;
      illustrator.showStatusMessage('Creating media gallery of type ' +
          algorithm);
      illustrator.mediaGalleryAlgorithms[algorithm].func(mediaItems);
      illustrator.calculateMediaGalleryCenter();
    },
    calculateMediaGalleryCenter: function() {
      var mediaGallery = document.getElementById('mediaGallery');
      var left = 0;
      var mediaItems = mediaGallery.childNodes;
      for (var i = 0, len = mediaItems.length; i < len; i++) {
        var mediaItem = mediaItems[i];
        // just look at the media items in the first row
        if (mediaItem.offsetTop < 5) {
          left = (mediaItem.offsetLeft + mediaItem.offsetWidth) / 2;
        } else {
          break;
        }
      }
      // if the media gallery has not rendered yet, simply call yourself again
      if (left === 0) {
        setTimeout(function() {
          illustrator.calculateMediaGalleryCenter();
        }, 500);
      }
      var top = mediaGallery.clientHeight / 2;
      illustrator.mediaGalleryCenter = {
        top: top,
        left: left
      };
    },
    speak: function(message) {
      if (!message) {
        return false;
      }

      illustrator.showStatusMessage('Trying to say "' + message + '"');

      var url = illustrator.SPEECH_SERVER + encodeURIComponent(message);

      var handleXhrError = function(url) {
        illustrator.showStatusMessage('Error while trying to load ' + url);
      };
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            try {
              var speech = JSON.parse(xhr.responseText);
              var audio = document.createElement('audio');
              audio.src = speech.base64;
              audio.addEventListener('ended', function() {
                audio.parentNode.removeChild(audio);
              });
              document.body.appendChild(audio);
              audio.play();
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
    }
  };

  illustrator.init();
  illustrator.speak('Hello! I am that magic voice deep inside your laptop!');
})();