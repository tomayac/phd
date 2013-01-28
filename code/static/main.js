(function() {
  var illustrator = {
    // constants
    DEBUG: true,
    MEDIA_SERVER: 'http://localhost:8001/search/combined/',
    PROXY_SERVER: 'http://localhost:8001/proxy/',
    MAX_INT: 9007199254740992,
    MAX_MEDIA_GALLERY_ROW_HEIGHT: 200,
    SIMILAR_TILES_FACTOR: 0.8,

    // global state
    statusMessageTimeout: null,
    canvas: null,
    ctx: null,

    // app logic
    queries: {},
    micropostUrls: {}, // the object key is always the micropost url
    mediaItems: {}, // the object key is always the proxied poster url
    clusters: [],

    // settings
    photosOnly: false,
    cols: 10,
    rows: 10,
    bwTolerance: 1,
    threshold: 10,
    similarTiles: 80,
    considerFaces: true,
    considerLuminance: true,

    init: function() {
      if (illustrator.DEBUG) console.log('Initializing app');

      var resizeTabsDiv = function() {
        var tab = document.getElementById('tabs');
        tab.style.minHeight = (window.innerHeight - tabs.offsetTop - 10) + 'px';
      };
      window.addEventListener('resize', resizeTabsDiv, false);
      resizeTabsDiv();

      var rankBySelect = document.getElementById('rankBy');
      for (var name in illustrator.rankingFormulas) {
        var option = document.createElement('option');
        option.innerHTML = name.substr(0, 1).toUpperCase() + name.substr(1);
        option.value = name;
        rankBySelect.appendChild(option);
      }
      rankBySelect.addEventListener('change', function() {
        illustrator.rankClusters();
      });

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
      mediaItemClusters.addEventListener('mouseover', function(e) {
        if (e.target.nodeName.toLowerCase() === 'img') {
          var img = e.target;
          illustrator.calculateHistograms(img, true);
          var dataUrl = illustrator.canvas.toDataURL('image/png');
          img.style.width = img.offsetWidth + 'px';
          img.style.height = img.offsetHeight + 'px';
          img.src = dataUrl;
        }
      });
      mediaItemClusters.addEventListener('mouseout', function(e) {
        if (e.target.nodeName.toLowerCase() === 'img') {
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

      var threshold = document.getElementById('threshold');
      threshold.value = illustrator.threshold;
      var thresholdLabel = document.getElementById('thresholdLabel');
      thresholdLabel.innerHTML = threshold.value;
      threshold.addEventListener('change', function() {
        thresholdLabel.innerHTML = threshold.value;
      });
      threshold.addEventListener('mouseup', function() {
        thresholdLabel.innerHTML = threshold.value;
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
        similarTilesLabel.innerHTML = similarTiles.value;
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
        bwToleranceLabel.innerHTML = bwTolerance.value;
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
        illustrator.rows = rows.value;
      });

      var cols = document.getElementById('cols');
      cols.value = illustrator.cols;
      cols.max = 50;
      cols.min = 1;
      var colsLabel = document.getElementById('colsLabel');
      colsLabel.innerHTML = cols.value;
      cols.addEventListener('change', function() {
        colsLabel.innerHTML = cols.value;
        illustrator.cols = cols.value;
      });

      var rowsColsChange = function() {
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
              var maxDimensionsIndex = -1;
              cluster.members.forEach(function(member, index) {
                var mediaItem = illustrator.mediaItems[member];
                var newDimensions = illustrator.calculateDimensions(mediaItem);
                if (newDimensions >= dimensions) {
                  dimensions = newDimensions;
                  maxDimensionsIndex = index;
                }
              });
              cluster.identifier = cluster.members[maxDimensionsIndex];
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
      document.getElementById('statusMessages').innerHTML = '';
      document.getElementById('mediaGallery').innerHTML = '';
      document.getElementById('query').value = '';
      document.getElementById('tab1').checked = true;
      illustrator.statusMessageTimeout = null;
      illustrator.queries = {};
      illustrator.mediaItems = {};
      illustrator.micropostUrls = {};
      illustrator.clusters = [];
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
      illustrator.clusterMediaItems();
    },
    calculateMinimumSimilarTiles: function() {
      return Math.ceil(illustrator.rows * illustrator.cols / 2);
    },
    calculateSimilarTiles: function() {
      return Math.ceil(illustrator.rows * illustrator.cols *
          illustrator.SIMILAR_TILES_FACTOR);
    },
    calculateDimensions: function(mediaItem) {
      // always prefer video over photo, so set the dimensions of videos
      // to MAX_INT, which overrules even high-res photos
      return (mediaItem.type === 'video' ?
          illustrator.MAX_INT :
          mediaItem.fullImage.width * mediaItem.fullImage.height);
    },
    clusterMediaItems: function() {
      illustrator.showStatusMessage('Clustering media items');

      illustrator.clusters = [];
      var keys = Object.keys(illustrator.mediaItems);
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
        illustrator.clusters.push({
          identifier: outer,
          members: members
        });
      }
      illustrator.mergeClusterData();
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
      size: function(a, b) {
        return b.members.length - a.members.length;
      },

      likes: function(a, b) {
        return b.statistics.likes - a.statistics.likes;
      },

      views: function(a, b) {
        return b.statistics.views - a.statistics.views;
      }

    },
    rankClusters: function() {
      illustrator.showStatusMessage('Ranking clusters');

      var rankBySelect = document.getElementById('rankBy');
      var rankingFormula = rankBySelect.selectedOptions[0].value;
      illustrator.clusters.sort(illustrator.rankingFormulas[rankingFormula]);

      illustrator.createClusterPreview();
    },
    createClusterPreview: function() {
      illustrator.showStatusMessage('Creating cluster preview');

      var getMediaItemHtml = function(mediaItem, opt_isFirst) {
        var firstMediaItem = opt_isFirst ? ' firstMediaItem' : '';
        var isRepresentative = opt_isFirst ? ' representative' : '';
        var hasFaces = mediaItem.faces.length ? ' face' : '';
        var url = illustrator.PROXY_SERVER +
            encodeURIComponent(mediaItem.posterUrl);
        var micropostWidth = Math.ceil(100 / mediaItem.thumbnail.height *
            mediaItem.thumbnail.width) + 'px;';
        var service = mediaItem.origin.toLowerCase() + '.png';
        return '' +
            '<div class="mediaItem' + firstMediaItem + '">' +
              '<a target="_newtab" href="' + mediaItem.micropostUrl + '">' +
                '<img class="photo photoBorder' + isRepresentative + hasFaces +
                    '" src="' + url + '" data-posterurl="' + url + '"/>' +
              '</a>' +
              '<img class="favicon" src="./resources/' + service + '"/>' +
              '<span class="close">X</span>' +
              '<div class="micropost" style="width:' + micropostWidth + '">' +
                mediaItem.micropost.plainText +
                '<hr/>' +
                'Likes: ' + mediaItem.socialInteractions.likes + '<br/>' +
                'Shares: ' + mediaItem.socialInteractions.shares + '<br/>' +
                'Comments: ' + mediaItem.socialInteractions.comments + '<br/>' +
                'Views: ' + mediaItem.socialInteractions.views +
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
        mediaItemHtml += getMediaItemHtml(mediaItem, true);

        cluster.members.forEach(function(url) {
          var member = illustrator.mediaItems[url];
          mediaItemHtml += getMediaItemHtml(member);
        });
        html += getClusterHtml(mediaItemHtml);
      });

      var mediaItemClusters = document.getElementById('mediaItemClusters');
      mediaItemClusters.innerHTML = html;
    },
    createMediaGallery: function() {
      illustrator.showStatusMessage('Creating media gallery');

      // media gallery algorithm credits to
      // http://blog.vjeux.com/2012/image/-
      // image-layout-algorithm-google-plus.html
      var heights = [];

      var calculateSizes = function(images, maxHeight) {
        var size = mediaGallery.offsetWidth - 20;
        var n = 0;
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
      };

      var getHeight = function(images, width) {
        var h = 0;
        for (var i = 0; i < images.length; ++i) {
          h += images[i].dataset.width / images[i].dataset.height;
        }
        return (width / h);
      };

      var setHeight = function(images, height) {
        heights.push(height);
        for (var i = 0; i < images.length; ++i) {
          images[i].style.width = (height * images[i].dataset.width /
              images[i].dataset.height);
          images[i].style.height = height;
        }
      };

      var mediaItems = [];
      illustrator.clusters.forEach(function(cluster) {
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
        mediaItems.push(item);
      });

      var fragment = document.createDocumentFragment();
      mediaItems.forEach(function(item) {
        var div = document.createElement('div');
        fragment.appendChild(div);
        div.classList.add('mediaItem');
        item.classList.add('photoBorder');
        item.classList.add('gallery');
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
      calculateSizes(mediaItems, illustrator.MAX_MEDIA_GALLERY_ROW_HEIGHT);
      mediaGallery.innerHTML = '';
      mediaGallery.appendChild(fragment);

      var resizeWindow = function() {
        calculateSizes(mediaItems, illustrator.MAX_MEDIA_GALLERY_ROW_HEIGHT);
      };
      window.addEventListener('resize', resizeWindow, false);
    }
  };

  illustrator.init();
})();