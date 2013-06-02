(function() {
  var illustrator = {
    // constants
    DEBUG: true,
    MEDIA_SERVER: './search/combined/',
    PROXY_SERVER: document.location.href + 'proxy/',
    SPEECH_SERVER: './speech/',
    DOWNLOAD_SERVER: './download/',
    TRANSLATION_SERVER: './translation/',
    ENTITY_EXTRACTION_SERVER: './entityextraction/combined/',
    SIMILAR_TILES_FACTOR: 2/3,

    // global state
    canvas: null,
    ctx: null,
    statusMessagesTimeout: null,
    statusMessages: document.getElementById('statusMessages'),

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
    mediaGalleryBigItems: {},

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
    mediaGalleryWidth: 1200,
    mediaItemHeight: 150,
    speechOutputEnabled: false,

    init: function() {
      if (illustrator.DEBUG) console.log('Initializing app');

      var resizeTabsDiv = function() {
        var tab = document.getElementById('tabs');
        tab.style.minHeight = (window.innerHeight - tabs.offsetTop - 10) + 'px';
      };
      window.addEventListener('resize', resizeTabsDiv, false);
      resizeTabsDiv();

      var downloadMediaGallery = document.getElementById('downloadMediaGallery');
      downloadMediaGallery.addEventListener('click', function() {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var mediaGallery = document.getElementById('mediaGallery');

        var mediaItems = mediaGallery.querySelectorAll('.gallery');
        var maxOffsetTop = 0;
        var maxOffsetLeft = 0;
        var cache = [];
        var len = mediaItems.length;
        for (var i = 0; i < len; i++) {
          var item = mediaItems[i];
          var parentDiv = item.parentNode.parentNode;
          var posterUrl = item.dataset.posterurl;
          var favicon = parentDiv.querySelector('.favicon');
          var dy = parentDiv.offsetTop;
          var dh = parentDiv.offsetHeight;
          if (dy + dh > maxOffsetTop) {
            maxOffsetTop = dy + dh;
          }
          var dx = parentDiv.offsetLeft;
          var dw = parentDiv.offsetWidth;
          if (dx + dw > maxOffsetLeft) {
            maxOffsetLeft = dx + dw;
          }
          cache[i] = {
            dx: dx,
            dy: dy,
            dw: dw,
            dh: dh,
            favicon: favicon,
            posterUrl: posterUrl
          };
        }
        var margin = 4;
        var fontSize = 8;
        canvas.width = maxOffsetLeft + 2 * margin;
        canvas.height = maxOffsetTop + 7 * margin + len * (fontSize + 3);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (var i = 0; i < len; i++) {
          var c = cache[i];
          var img = illustrator.mediaItems[c.posterUrl].fullImage;
          var sw;
          var sh;
          var aspectRatio = img.naturalWidth / img.naturalHeight;
          if (illustrator.mediaGalleryAlgorithm === 'looseOrder') {
            if (aspectRatio > 1 /* landscape */) {
              sw = img.naturalHeight;
              sh = img.naturalHeight;
            } else /* portrait */ {
              sw = img.naturalWidth;
              sh = img.naturalWidth;
            }
          } else if (illustrator.mediaGalleryAlgorithm === 'strictOrder') {
            sw = img.naturalWidth;
            sh = img.naturalHeight;
          }
          ctx.drawImage(img, 0, 0, sw, sh, c.dx, c.dy + margin, c.dw, c.dh);
          ctx.drawImage(c.favicon, c.dx + 5, c.dy + margin + 5);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c.dx + 1, c.dy + margin + 1, c.dw - 1, c.dh - 1);
          var micropostUrl = illustrator.mediaItems[c.posterUrl].micropostUrl;
          ctx.strokeStyle = 'white';
          ctx.fillStyle = 'black';
          ctx.lineWidth = 3;
          ctx.font = fontSize + 'pt Helvetica';
          var index = i + 1;
          ctx.strokeText(index, c.dx + 23, c.dy + margin + 16, c.dw - 1);
          ctx.fillText(index, c.dx + 23, c.dy + margin + 16, c.dw - 1);
          ctx.fillText('[' + index + '] Source: ' + micropostUrl, margin,
              maxOffsetTop + 5 * margin + i * (fontSize + 3), maxOffsetLeft);
        }
        var dataUrl = canvas.toDataURL('image/png');

        var formData = new FormData();
        formData.append('base64', dataUrl);
        formData.append('fileName', 'media_gallery_' + Date.now() + '.png');
        var xhr = new XMLHttpRequest();
        xhr.open('POST', illustrator.DOWNLOAD_SERVER, true);
        xhr.onload = function(e) {
          var response = JSON.parse(xhr.responseText);
          if (response.path) {
            var downloadLink = document.createElement('a');
            downloadLink.href = illustrator.DOWNLOAD_SERVER +
                response.path;
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
            downloadLink.click();
          }
        };
        xhr.send(formData);
      });

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
        illustrator.mediaGalleryAlgorithm = mediaGalleryAlgorithmSelect
            .options[mediaGalleryAlgorithmSelect.selectedIndex].value;
        illustrator.createMediaGallery();
      });

      var weightChanged = function(e) {
        illustrator.weights[e.target.name] = parseInt(e.target.value, 10);
        illustrator.rankClusters();
      };

      var likesWeight = document.getElementById('likesWeight');
      likesWeight.value = parseInt(illustrator.weights.likes, 10);
      likesWeight.addEventListener('change', weightChanged);

      var sharesWeight = document.getElementById('sharesWeight');
      sharesWeight.value = parseInt(illustrator.weights.shares, 10);
      sharesWeight.addEventListener('change', weightChanged);

      var commentsWeight = document.getElementById('commentsWeight');
      commentsWeight.value = parseInt(illustrator.weights.comments, 10);
      commentsWeight.addEventListener('change', weightChanged);

      var viewsWeight = document.getElementById('viewsWeight');
      viewsWeight.value = parseInt(illustrator.weights.views, 10);
      viewsWeight.addEventListener('change', weightChanged);

      var crossNetworkWeight = document.getElementById('crossNetworkWeight');
      crossNetworkWeight.value = parseInt(illustrator.weights.crossNetwork, 10);
      crossNetworkWeight.addEventListener('change', weightChanged);

      var recencyWeight = document.getElementById('recencyWeight');
      recencyWeight.value = parseInt(illustrator.weights.recency, 10);
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
          } else if (!image2 && (img !== image1)) {
            image2 = img;
          }
          if (image1 && image2) {
            var posterUrl1 = image1.dataset.posterurl;
            var posterUrl2 = image2.dataset.posterurl;
            if ((posterUrl1 && posterUrl2) && (posterUrl1 !== posterUrl2)) {
              image1 = null;
              image2 = null;
              illustrator.clusterMediaItems(posterUrl1, posterUrl2);
            }
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

      mediaGallery.addEventListener('keydown', function(e) {
        // zoom out the currently zoomed-in media item
        var activeElement = document.activeElement;
        if (activeElement.classList.contains('mediaItem')) {
          var img = activeElement.querySelector('img, video');
          zoomOut(mediaGallery, activeElement, img);
        } else {
          activeElement = document.querySelector('mediaItem');
        }
        var mediaItems =
            mediaGallery.querySelectorAll('.mediaItem:not(.clone)');
        var index;
        var childCount = mediaItems.length;
        for (index = 0; index < childCount; index++) {
          if (mediaItems[index] === activeElement) {
            break;
          }
        }
        if (e.keyCode === 37 /* left arrow */) {
          mediaItems.item(index > 0 ? index - 1 : childCount - 1).focus();
        } else if (e.keyCode === 39 /* right arrow */) {
          mediaItems.item((index + 1) % childCount).focus();
        }
      });

      mediaGallery.addEventListener('focus', function(e) {
        if (e.target.classList.contains('mediaItem')) {
          var mediaItem = e.target;
          var key = mediaItem.querySelector('.gallery').dataset.posterurl;
          var cluster;
          for (var i = 0, len = illustrator.clusters.length; i < len; i++) {
            cluster = illustrator.clusters[i];
            if (cluster.identifier === key) {
              break;
            }
          }
          var micropostCandidates = cluster.translations;
          var maxLength = 0;
          var minLength = Infinity;
          var longestMicropost;
          var shortestMicropost;
          for (var i = 0, len = micropostCandidates.length; i < len; i++) {
            var micropostLength = micropostCandidates[i].length;
            if (micropostLength > maxLength) {
              longestMicropost = micropostCandidates[i];
            }
            if (micropostLength < minLength) {
              shortestMicropost = micropostCandidates[i];
            }
          }
console.log('Shortest post:\n' + shortestMicropost)
console.log('Longest post:\n' + longestMicropost)
          var micropost = shortestMicropost;

          if (illustrator.speechOutputEnabled) {
            illustrator.removeAllAudio();
            illustrator.speak(micropost);
          }

          var img = mediaItem.querySelector('img, video');
          zoomIn(mediaGallery, mediaItem, img);
        }
      }, true /* This is important, else, the event never fires */);

      mediaGallery.addEventListener('blur', function(e) {
        if (e.target.classList.contains('mediaItem')) {
          var mediaItem = e.target;
          var img = mediaItem.querySelector('img, video');
          zoomOut(mediaGallery, mediaItem, img);
        }
      }, true /* This is important, else, the event never fires */);

      var zoomIn = function(mediaGallery, div, img) {
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
            mediaItems[i].style['-webkit-filter'] =
                'blur(10px) grayscale(100%)';
            mediaItems[i].style['filter'] = 'blur(10px) grayscale(100%)';
          }
        }
      };

      var zoomOut = function(mediaGallery, div, img) {
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
      };

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
      mediaGallerySize.value = parseInt(illustrator.mediaGallerySize, 10);
      mediaGallerySizeLabel.innerHTML = illustrator.mediaGallerySize;
      mediaGallerySize.addEventListener('change', function() {
        mediaGallerySizeLabel.innerHTML = mediaGallerySize.value;
      });
      mediaGallerySize.addEventListener('mouseup', function() {
        illustrator.mediaGallerySize = parseInt(mediaGallerySize.value, 10);
        illustrator.createMediaGallery(true);
      });

      var mediaGalleryWidth = document.getElementById('mediaGalleryWidth');
      var mediaGalleryWidthLabel =
          document.getElementById('mediaGalleryWidthLabel');
      mediaGalleryWidth.min = 300;
      mediaGalleryWidth.max = 2000;
      mediaGalleryWidth.value = illustrator.mediaGalleryWidth;
      mediaGalleryWidthLabel.innerHTML = illustrator.mediaGalleryWidth;
      mediaGalleryWidth.addEventListener('change', function() {
        mediaGalleryWidthLabel.innerHTML = mediaGalleryWidth.value;
      });
      mediaGalleryWidth.addEventListener('mouseup', function() {
        illustrator.mediaGalleryWidth = parseInt(mediaGalleryWidth.value, 10);
        illustrator.createMediaGallery(true);
      });

      var mediaItemHeight = document.getElementById('mediaItemHeight');
      var mediaItemHeightLabel =
          document.getElementById('mediaItemHeightLabel');
      mediaItemHeight.min = 50;
      mediaItemHeight.max = 500;
      mediaItemHeight.value = illustrator.mediaItemHeight;
      mediaItemHeightLabel.innerHTML = illustrator.mediaItemHeight;
      mediaItemHeight.addEventListener('change', function() {
        mediaItemHeightLabel.innerHTML = mediaItemHeight.value;
      });
      mediaItemHeight.addEventListener('mouseup', function() {
        illustrator.mediaItemHeight = parseInt(mediaItemHeight.value, 10);
        illustrator.createMediaGallery(true);
      });

      var maxAge = document.getElementById('maxAge');
      maxAge.max = 7 * 24 * 60 * 60 * 1000; // 7 days
      maxAge.min = 1 * 60 * 1000; // 1 minute
      maxAge.value = illustrator.maxAge;
      var maxAgeLabel = document.getElementById('maxAgeLabel');
      maxAgeLabel.innerHTML = humaneDate(new Date((Date.now() -
          parseInt(maxAge.value, 10))));
      maxAge.addEventListener('change', function() {
        maxAgeLabel.innerHTML = humaneDate(new Date((Date.now() -
            parseInt(maxAge.value, 10))));
      });
      maxAge.addEventListener('mouseup', function() {
        illustrator.maxAge = parseInt(maxAge.value, 10);
        illustrator.filterForMaxAgeAndVisibility();
      });

      var threshold = document.getElementById('threshold');
      threshold.value = illustrator.threshold;
      var thresholdLabel = document.getElementById('thresholdLabel');
      thresholdLabel.innerHTML = threshold.value;
      threshold.addEventListener('change', function() {
        thresholdLabel.innerHTML = threshold.value;
      });
      threshold.addEventListener('mouseup', function() {
        illustrator.threshold = parseInt(threshold.value, 10);
        illustrator.clusterMediaItems();
      });

      var similarTiles = document.getElementById('similarTiles');
      similarTiles.min = illustrator.calculateMinimumSimilarTiles();
      similarTiles.max = illustrator.rows * illustrator.cols;
      similarTiles.value = illustrator.calculateSimilarTiles();
      illustrator.similarTiles = parseInt(similarTiles.value, 10);
      var similarTilesLabel =
          document.getElementById('similarTilesLabel');
      similarTilesLabel.innerHTML = similarTiles.value;
      similarTiles.addEventListener('change', function() {
        similarTilesLabel.innerHTML = similarTiles.value;
      });
      similarTiles.addEventListener('mouseup', function() {
        illustrator.similarTiles = parseInt(similarTiles.value, 10);
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
        illustrator.bwTolerance = parseInt(bwTolerance.value, 10);
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
        illustrator.rows = parseInt(rows.value, 10);
        illustrator.cols = parseInt(cols.value, 10);
        similarTiles.min = illustrator.calculateMinimumSimilarTiles();
        similarTiles.max = illustrator.rows * illustrator.cols;
        similarTiles.value = illustrator.calculateSimilarTiles();
        illustrator.similarTiles = parseInt(similarTiles.value, 10);
        similarTilesLabel.innerHTML = parseInt(similarTiles.value, 10);
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
      queryLogDiv.addEventListener('click', function(e) {
        if ((e.target.nodeName.toLowerCase() === 'input') ||
            (e.target.nodeName.toLowerCase() === 'label')) {
          // can use checkbox, even if the label was clicked
          var target = e.target;
          var queryId = target.parentNode.getElementsByTagName('label')[0]
              .getAttribute('for');
          var checkbox = target.parentNode.getElementsByTagName('input')[0];
          var sources = illustrator.queries[queryId].forEach(function(source) {
            illustrator.mediaItems[source].currentlyVisible = checkbox.checked;
          });
          illustrator.filterForMaxAgeAndVisibility();
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

      illustrator.socket = io.connect('/');
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
        illustrator.showStatusMessage('Proxying file ' + decodeURIComponent(data.url.replace(illustrator.PROXY_SERVER, '')));
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
      document.getElementById('differences').innerHTML = '';
      document.getElementById('differences').style.display = 'none';
      document.getElementById('query').value = '';
      document.getElementById('tab1').checked = true;
      illustrator.statusMessages.innerHTML = '';
      illustrator.statusMessagesTimeout = null;
      illustrator.queries = {};
      illustrator.mediaItems = {};
      illustrator.micropostUrls = {};
      illustrator.clusters = [];
      illustrator.mediaGalleryZIndex = 1;
      illustrator.mediaGalleryBigItems = {};
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
      var queryId = Date.now();

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
      var sw = ~~(img.naturalWidth / illustrator.cols);
      var sh = ~~(img.naturalHeight / illustrator.rows);
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
    updateQueryLog: function(query, queryId) {
      var queryLogDiv = document.getElementById('queryLog');
      var fragment = document.createDocumentFragment();
      var div = document.createElement('div');
      fragment.appendChild(div);
      div.setAttribute('class', 'queryLog');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.id = queryId;
      div.appendChild(input);
      var label = document.createElement('label');
      label.setAttribute('for', queryId);
      div.appendChild(label);
      var strong = document.createElement('strong');
      strong.textContent = query;
      label.appendChild(strong);
      var numResults = Object.keys(illustrator.mediaItems).length;
      label.appendChild(document.createTextNode(' (' + numResults + ')'));
      queryLogDiv.appendChild(fragment);
    },

    retrieveMediaItems: function(results, query, queryId) {

      illustrator.showStatusMessage('Retrieving media items');

      var checkMediaItemStatuses = function(target) {
        for (var key in illustrator.mediaItems) {
          if (illustrator.mediaItems[key].status !== target) {
            return false;
          }
        }
        illustrator.updateQueryLog(query, queryId);
        return true;
      };

      var preloadImage = function(src, success, error) {
        var image = new Image();
        image.onerror = function() {
          return error(src);
        };
        image.onload = function() {
          return success(image);
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
        mediaUrl = illustrator.PROXY_SERVER + encodeURIComponent(mediaUrl);
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
        detectFaces(image, image.naturalWidth, image.naturalHeight);
        illustrator.calculateHistograms(image);
        preloadFullImage(image.src, micropostUrl);
      };

      var errorThumbnail = function(src) {
        delete illustrator.mediaItems[src];
        if (illustrator.DEBUG) console.log('Removing thumbnail ' + src);
        if (checkMediaItemStatuses('loaded')) {
          illustrator.calculateDistances();
        }
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
        if (illustrator.DEBUG) console.log('Removing full image ' + posterUrl);
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
          item.currentlyVisible = true;
          illustrator.mediaItems[posterUrl] = item;
          // load the poster url as thumbnail
          preloadImage(
            posterUrl,
            function(image) {
              successThumbnail(image, micropostUrl);
            },
            errorThumbnail);
        });
      }
      if (numResults === 0) {
        illustrator.showStatusMessage('No results for "' + query + '"');
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
      illustrator.filterForMaxAgeAndVisibility();
    },
    filterForMaxAgeAndVisibility: function() {
      illustrator.showStatusMessage('Filtering media items for maximum age and visibility');
      var now = Date.now();
      for (var key in illustrator.mediaItems) {
        var mediaItem = illustrator.mediaItems[key];
        // check for visibility (media items stemming from certain query terms
        // in the queryLog can be turned on and off)
        // if visible, then also check for max age
        if (mediaItem.currentlyVisible) {
          // FixMe: needs to check for timezones!
          // don't consider items from the future
          if (mediaItem.timestamp > now) {
            mediaItem.considerMediaItem = true; // was: false
          }
          // perfect
          else if (now - mediaItem.timestamp <= illustrator.maxAge) {
            mediaItem.considerMediaItem = true;
          // too old
          } else {
            mediaItem.considerMediaItem = false;
          }
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
          Infinity :
          mediaItem.fullImage.naturalWidth * mediaItem.fullImage.naturalHeight);
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
      var similarTilesIndexes = [];
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
                if (debugOnly) {
                  similarTilesIndexes.push(true);
                }
              } else {
                if (debugOnly) {
                  similarTilesIndexes.push(false);
                }
              }
            } else {
              nulls++;
              if (debugOnly) {
                similarTilesIndexes.push(null);
              }
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
          if (illustrator.DEBUG) console.log('Similar tiles: ' +
              similarTiles + '\nMinimum required: ' + minimumRequired +
              '\nOverall: ' + (illustrator.cols * illustrator.rows) +
              '\nNulls: ' + nulls + '\nPercent: ' +
              ((similarTiles / (illustrator.cols * illustrator.rows)) * 100) +
              '%');
          illustrator.showDiffImages(opt_outer, opt_inner, similarTilesIndexes);
          illustrator.sayDiffImages(opt_outer, opt_inner, similarTilesIndexes,
              similarTiles, minimumRequired, nulls);
          return;
        }
      }

      illustrator.displayClusterStatistics();

      illustrator.mergeClusterData();
    },
    showDiffImages: function(opt_outer, opt_inner, similarTilesIndexes) {

      var createMatchingTilesGrid = function(image, indexes, invert) {
        var fragment = document.createDocumentFragment();
        var fixedHeight = image.naturalHeight < 150 ? image.naturalHeight : 150;
        var scalingFactor = fixedHeight / image.naturalHeight;
        var aspectRatio = image.naturalWidth / image.naturalHeight;
        var tileHeight = ~~(image.naturalHeight / illustrator.rows);
        var tileWidth =
            ~~((image.naturalHeight * aspectRatio) / illustrator.cols);
        var len = illustrator.cols * illustrator.rows;
        for (var i = 0; i < len; i++) {
          // calculate the boundaries for the current tile from the
          // image and translate it to boundaries on the main canvas
          var mod = (i % illustrator.cols);
          var div = ~~(i / illustrator.cols);
          var sx = mod * tileWidth;
          var sy = div * tileHeight;
          if (mod === 0) {
            fragment.appendChild(document.createElement('br'));
          }
          if (invert) {
            if (indexes[i] === true) {
              indexes[i] = false;
            } else if (indexes[i] === false) {
              indexes[i] = true;
            }
          }
          if (indexes[i] === true) {
            var tile = document.createElement('img');
            tile.src = image.src + '#xywh=' + sx + ',' + sy + ',' + tileWidth +
                ',' + tileHeight;
            tile.classList.add('tileBorder');
            if (!invert) {
              tile.classList.add('matchingTile');
            } else {
              tile.classList.add('nonMatchingTile');
            }
            fragment.appendChild(tile);
          } else if (indexes[i] === false) {
            var transparent = document.createElement('img');
            transparent.style.cssText = 'width:' + tileWidth + 'px;' +
                'height:' + tileHeight + 'px;';
            transparent.classList.add('tileBorder');
            fragment.appendChild(transparent);
          } else if (indexes[i] === null) {
            var nullTile = document.createElement('img');
            nullTile.style.cssText = 'width:' + tileWidth + 'px;' +
                'height:' + tileHeight + 'px;';
            nullTile.classList.add('checkerbordTile');
            fragment.appendChild(nullTile);
          }
        }
        return {
          fragment: fragment,
          scalingFactor: scalingFactor
        };
      };

      var left = document.createElement('img');
      left.src = opt_outer;

      var right = document.createElement('img');
      right.src = opt_inner;

      var table = document.createElement('table');
      var matchesRow = document.createElement('tr');
      var diffRow = document.createElement('tr');
      table.appendChild(matchesRow);
      table.appendChild(diffRow);

      var matchLeft =
          createMatchingTilesGrid(left, similarTilesIndexes.slice(0), false);
      var matchLeftTd = document.createElement('td');
      matchLeftTd.appendChild(matchLeft.fragment);
      matchLeftTd.style.cssText +=
          '-webkit-transform:scale(' + matchLeft.scalingFactor + '); ' +
          'transform:scale(' + matchLeft.scalingFactor + ');';
      matchesRow.appendChild(matchLeftTd);

      var diffLeft =
          createMatchingTilesGrid(left, similarTilesIndexes.slice(0), true);
      var diffLeftTd = document.createElement('td');
      diffLeftTd.appendChild(diffLeft.fragment);
      diffLeftTd.style.cssText +=
          '-webkit-transform:scale(' + diffLeft.scalingFactor + '); ' +
          'transform:scale(' + diffLeft.scalingFactor + ');';
      diffRow.appendChild(diffLeftTd);

      var matchRight =
          createMatchingTilesGrid(right, similarTilesIndexes.slice(0), false);
      var matchRightTd = document.createElement('td');
      matchRightTd.appendChild(matchRight.fragment);
      matchRightTd.style.cssText +=
          '-webkit-transform:scale(' + matchRight.scalingFactor + '); ' +
          'transform:scale(' + matchRight.scalingFactor + ');';
      matchesRow.appendChild(matchRightTd);

      var diffRight =
          createMatchingTilesGrid(right, similarTilesIndexes.slice(0), true);
      var diffRightTd = document.createElement('td');
      diffRightTd.appendChild(diffRight.fragment);
      diffRightTd.style.cssText +=
          '-webkit-transform:scale(' + diffRight.scalingFactor + '); ' +
          'transform:scale(' + diffRight.scalingFactor + ');';
      diffRow.appendChild(diffRightTd);

      var differencesDiv = document.getElementById('differences');
      differencesDiv.innerHTML = '';
      var close = document.createElement('span');
      close.classList.add('close');
      close.innerHTML = 'X';
      close.style.display = 'block';
      differencesDiv.appendChild(close);
      close.addEventListener('click', function() {
        illustrator.removeAllAudio();
        differencesDiv.style.display = 'none';
        differencesDiv.innerHTML = '';
      });
      differencesDiv.appendChild(table);
      differencesDiv.style.display = 'block';

      mediaFragments.apply(differencesDiv);
    },
    sayDiffImages: function(opt_outer, opt_inner, similarTilesIndexes,
        similarTiles, minimumRequired, nulls) {
      var facesLeft = illustrator.mediaItems[opt_outer].faces.length;
      var facesRight = illustrator.mediaItems[opt_inner].faces.length;
      var hasEqualFaces = facesLeft === facesRight;
      var isSimilar = similarTiles >= minimumRequired;
      var overall = illustrator.cols * illustrator.rows;
      var percent = similarTiles / overall * 100;

      // clustered at all or not?
      var clusteredOrNot = function(callback) {
        if (isSimilar) {
          illustrator.speak('The two media items are ' +
          (similarTiles === overall ?
              'exact duplicates.' : 'near-duplicates.'), callback);
        } else {
          illustrator.speak('The two media items are different.', callback);
        }
      };

      // same amount of faces?
      var sameAmountOfFaces = function(callback) {
        if (facesLeft === 0 && facesRight === 0) {
          illustrator.speak('Neither the left, nor the right media item ' +
              'contain detected faces.', callback);
        } else if (hasEqualFaces) {
          illustrator.speak('Both, the left and the right media item ' +
              'contain ' + facesLeft + ' detected ' +
              (facesLeft === 1 ? 'face.' : 'faces.'), callback);
        } else {
          illustrator.speak('The left media item contains ' +
              (facesLeft === 0 ? 'no ' : facesLeft + ' ') + 'detected ' +
              (facesLeft === 1 ? 'face' : 'faces') +
              (hasEqualFaces ? ' and ' : ', while ') + 'the right media item ' +
              (hasEqualFaces ? 'also ' : '') + 'contains ' +
              (facesRight === 0 ? 'no detected ' : facesRight + ' detected ') +
              (facesRight === 1 ? 'face.' : 'faces.'), callback);
        }
      };

      // how many tiles?
      var tileStatistics = function(callback) {
        var matchingTiles = document.querySelectorAll('.matchingTile');
        for (var i = 0, len = matchingTiles.length; i < len; i++) {
          matchingTiles[i].classList.add('highlightTile');
        }
        if (similarTiles > 0) {
          illustrator.speak('Out of overall ' + overall + ' tiles, ' +
              (isSimilar ? '' : 'only ') + similarTiles +
              ' from the minimum required ' +
              minimumRequired + ' tiles ' +
              (similarTiles > 1 ? 'were ' : 'was ') + 'similar enough to be ' +
              'clustered. This corresponds to ' +
              (Math.round(percent) == percent ?
                  percent : 'roughly ' + Math.round(percent)) + ' ' +
              'percent of all tiles.', function(message) {
                for (var i = 0, len = matchingTiles.length; i < len; i++) {
                  matchingTiles[i].classList.remove('highlightTile');
                }
                callback(message);
              });
          } else {
            illustrator.speak('Out of overall ' + overall + ' tiles, ' +
                'not a single one was similar enough to be clustered.',
                callback);
          }
      };

      // how many nulls?
      var nullStatistics = function(callback) {
        if (nulls > 0) {
          var nullTiles = document.querySelectorAll('.checkerbordTile');
          for (var i = 0, len = nullTiles.length; i < len; i++) {
            nullTiles[i].classList.add('highlightTile');
          }
          illustrator.speak('However, ' + nulls + ' ' +
              (nulls > 1 ?
                  'tiles were not considered, as they are ' :
                  'tile was not considered, as it is ') +
              'either too bright or too dark, which ' +
              'is a common source of clustering issues.', function(message) {
                for (var i = 0, len = nullTiles.length; i < len; i++) {
                  nullTiles[i].classList.remove('highlightTile');
                }
                callback(message);
              });
        } else {
          callback();
        }
      };

      clusteredOrNot(function() {
        tileStatistics(function() {
          nullStatistics(function() {
            sameAmountOfFaces(function() {
            });
          });
        });
      });
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
        name: 'Cluster Size',
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
          var now = Date.now();
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
      var formula = rankBySelect.options[rankBySelect.selectedIndex].value;
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
        var micropostWidth = Math.ceil(100 / mediaItem.thumbnail.naturalHeight *
            mediaItem.thumbnail.naturalWidth) + 'px;';
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
                'Aspect Ratio: ' +
                    (Math.round(mediaItem.fullImage.naturalWidth /
                    mediaItem.fullImage.naturalHeight * 100) / 100) + '<br/>' +
                'Megapixels: ' + (Math.round(mediaItem.fullImage.naturalWidth *
                    mediaItem.fullImage.naturalHeight / 1000000 * 100) / 100) +
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
            var size = illustrator.mediaGalleryWidth;
            var n = 0;
            w: while (images.length > 0) {
              for (var i = 1; i < images.length + 1; ++i) {
                var slice = images.slice(0, i);
                var h = getHeight(slice, size);
                if (h < illustrator.mediaItemHeight) {
                  setHeight(slice, h);
                  n++;
                  images = images.slice(i);
                  continue w;
                }
              }
              setHeight(slice, Math.min(illustrator.mediaItemHeight, h));
              n++;
              break;
            }
          };

          var getHeight = function(images, width) {
            width -= images.length * 4;
            var h = 0;
            for (var i = 0, len = images.length; i < len; ++i) {
              h += images[i].dataset.width / images[i].dataset.height;
            }
            return (width / h);
          };

          var setHeight = function(images, height) {
            heights.push(height);
            for (var i = 0, len = images.length; i < len; ++i) {
              var width = (height * images[i].dataset.width /
                  images[i].dataset.height);
              images[i].style.width = width;
              images[i].style.height = height;
              images[i].parentNode.parentNode.style.width = width;
              images[i].parentNode.parentNode.style.height = height;
            }
          };

          var fragment = document.createDocumentFragment();
          mediaItems.forEach(function(item, i) {
            var div = document.createElement('div');
            fragment.appendChild(div);
            div.classList.add('mediaItem');
            div.tabIndex = i + 1;
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
          var containerDiv = document.createElement('div');
          containerDiv.style.width =
              (illustrator.mediaGalleryWidth + mediaItems.length * 4) + 'px';
          mediaGallery.appendChild(containerDiv);
          containerDiv.appendChild(fragment);
          calculateSizes(mediaItems);
        }
      },
      looseOrder: {
        name: 'Loose order, varying size',
        func: function(mediaItems, opt_resizeOnly) {
          if (!opt_resizeOnly) {
            illustrator.mediaGalleryBigItems = {};
          }

          // media gallery algorithm credits to
          // http://blog.vjeux.com/2012/image/-
          // image-layout-algorithm-facebook.html
          var heights = [];
          var columnSize = illustrator.mediaItemHeight;
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
            for (var i = 0, len = heights.length; i < len; ++i) {
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
            var mediaItem = elem.firstChild.firstChild;
            var posterUrl = mediaItem.dataset.posterurl;
            if (isBig) {
              elem.classList.add('big');
              illustrator.mediaGalleryBigItems[posterUrl] = true;
            } else {
              illustrator.mediaGalleryBigItems[posterUrl] = false;
            }
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
            var size = illustrator.mediaGalleryWidth;
            var nColumns = Math.floor(size / (2 * (columnSize + margin)));
            createColumns(nColumns);

            var smallImages = [];
            for (var i = 0, len = images.length; i < len; ++i) {
              var image = images[i];
              var column = getMinColumn();
              var wasBigElseRandom;
              if (opt_resizeOnly) {
                var posterUrl = image.firstChild.firstChild.dataset.posterurl;
                wasBigElseRandom = illustrator.mediaGalleryBigItems[posterUrl];
              } else {
                wasBigElseRandom = Math.random() > 0.7;
              }
              // The following if statement is an _ugly_ hack as the image proxy
              // https://images1-focus-opensocial.googleusercontent.com
              // delivers differently sized images on demand.
              // In consequence, if we only resize, we use the previous value,
              // else, if the media gallery gets generated anew, we make the
              // dimensions check and add a random component.
              var wasBig;
              if (opt_resizeOnly) {
                wasBig = wasBigElseRandom;
              } else {
                wasBig = (wasBigElseRandom) &&
                    (image.dataset.width * image.dataset.height > dimensions);
              }
              if (wasBig) {
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
          mediaItems.forEach(function(item, i) {
            var div = document.createElement('div');
            div.classList.add('mediaItem');
            div.tabIndex = i + 1;
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
        }
      }
    },
    createMediaGallery: function(opt_resizeOnly) {
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
          item.setAttribute('preload', 'auto');
          item.setAttribute('loop', 'loop');
        }
        item.dataset.posterurl = cluster.identifier;
        item.dataset.width = mediaItem.fullImage.naturalWidth;
        item.dataset.height = mediaItem.fullImage.naturalHeight;
        item.dataset.origin = mediaItem.origin;
        item.dataset.microposturl = mediaItem.micropostUrl;
        item.classList.add('gallery');
        mediaItems.push(item);
      });

      var algorithm = illustrator.mediaGalleryAlgorithm;
      illustrator.showStatusMessage('Creating media gallery of type ' +
          algorithm);
      illustrator.mediaGalleryAlgorithms[algorithm].func(mediaItems,
          opt_resizeOnly);
      var length = mediaItems.length;
      document.querySelector('#mediaGallerySize').value = length;
      document.querySelector('#mediaGallerySizeLabel').innerHTML = length;
      illustrator.calculateMediaGalleryCenter();
    },
    calculateMediaGalleryCenter: function() {
      if (illustrator.DEBUG) console.log('Calculating media gallery center');
      var mediaGallery = document.getElementById('mediaGallery');
      var left = 0;
      var top = 0;
      var mediaItems = mediaGallery.querySelectorAll('.mediaItem:not(.clone)');
      if (mediaItems.length === 0) {
        return;
      }
      for (var i = 0, len = mediaItems.length; i < len; i++) {
        var mediaItem = mediaItems[i];
        // just look at the media items in the first row
        if (mediaItem.offsetLeft + mediaItem.offsetWidth > left) {
          left = mediaItem.offsetLeft + mediaItem.offsetWidth;
        }
        if (mediaItem.offsetTop + mediaItem.offsetHeight > top) {
          top = mediaItem.offsetTop + mediaItem.offsetHeight;
        }
      }
      illustrator.mediaGalleryCenter = {
        left: Math.min(left, mediaGallery.clientWidth) / 2,
        top: Math.min(top, mediaGallery.clientHeight) / 2
      };
      illustrator.translateMicroposts();
    },
    translateMicroposts: function() {
      if (illustrator.clusters[0].translations) {
        if (illustrator.DEBUG) console.log('Microposts already translated');
        return;
      }
      if (illustrator.DEBUG) console.log('Translating microposts');
      var microposts = [];
      var clusterIndexes = [];
      for (var i = 0, len = illustrator.clusters.length; i < len; i++) {
        var cluster = illustrator.clusters[i];
        microposts.push(
            illustrator.mediaItems[cluster.identifier].micropost.plainText);
        clusterIndexes.push(i);
        for (var j = 0, length = cluster.members.length; j < length; j++) {
          var member = cluster.members[j];
          microposts.push(illustrator.mediaItems[member].micropost.plainText);
          clusterIndexes.push(i);
        }
      }
      var formData = new FormData();
      formData.append('toLanguage', 'en');
      microposts.forEach(function(micropost) {
        formData.append('texts', encodeURIComponent(micropost));
      });
      var xhr = new XMLHttpRequest();
      xhr.open('POST', illustrator.TRANSLATION_SERVER, true);
      xhr.onload = function(e) {
        try {
          var response = JSON.parse(xhr.responseText);
          for (var i = 0, len = response.translations.length; i < len; i++) {
            var index = clusterIndexes[i];
            if (!illustrator.clusters[index].translations) {
              illustrator.clusters[index].translations = [];
            }
            illustrator.clusters[index].translations.push(
                response.translations[i]);
          }
          illustrator.extractEntities();
        } catch(e) {
          console.log('Translation error ' + e);
        }
      };
      xhr.onerror = function(e) {
        console.log('Translation error: ' + e);
      }
      xhr.send(formData);
    },
    extractEntities: function() {
      if (illustrator.clusters[0].entities) {
        if (illustrator.DEBUG) console.log('Entities already extracted');
        return;
      }
      if (illustrator.DEBUG) console.log('Extracting entities from microposts');
      var handleXhrError = function(url) {
        illustrator.showStatusMessage('Error while trying to load ' + url);
      };
      var len = illustrator.clusters.length;
      var pending = len;
      for (var i = 0; i < len; i++) {
        var cluster = illustrator.clusters[i];
        var text;
        for (var j = 0, length = cluster.translations.length; j < length; j++) {
          text += cluster.translations[j] + '\n';
        }
        var url = illustrator.ENTITY_EXTRACTION_SERVER +
            encodeURIComponent(text);
        (function(index) {
          var xhr = new XMLHttpRequest();
          xhr.onreadystatechange = function() {
            if (xhr.readyState == 4) {
              if (xhr.status == 200) {
                pending--;
                try {
                  var entities = JSON.parse(xhr.responseText);
                  illustrator.clusters[index].entities = entities;
                  if (pending === 0) {
                    // console.log(illustrator.clusters);
                  }
                } catch(e) {
                  if (illustrator.DEBUG) console.log(e);
                  handleXhrError(url);
                }
              } else {
                pending--;
                handleXhrError(url);
              }
            }
          };
          xhr.onerror = function() {
            handleXhrError(url);
          };
          xhr.open("GET", url, true);
          xhr.send(null);
        })(i);
      }
    },
    removeAllAudio: function() {
      var audios = document.querySelectorAll('audio');
      for (var i = 0, len = audios.length; i < len; i++) {
        var audio = audios[i];
        audio.parentNode.removeChild(audio);
      }
    },
    speak: function(message, opt_callback) {
      if (!message) {
        return false;
      }

      illustrator.showStatusMessage('Saying "' + message + '"');

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
                if (audio) {
                  audio.parentNode.removeChild(audio);
                }
                if (opt_callback) {
                  opt_callback(message);
                }
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
})();