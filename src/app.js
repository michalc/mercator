(function(global) {
  'use strict';

  function clamp(val, min, max) {
    return Math.max(Math.min(val, max), min);
  }

  var app = angular.module('mercator', []);

  app.factory('Mercator', function() {
    return {
      toChart: toChart,
      toEarth: toEarth,
      bearing: bearing
    };

    function toRadians(deg) {
      return deg * Math.PI / 180;
    }

    function toDegrees(rad) {
      return rad * 180 / Math.PI;
    }

    function yToTheta(W, y) {
      return 2 * Math.atan(Math.exp(y * 2 * Math.PI / W)) - Math.PI / 2;
    }

    function thetaToY(W, theta) {
      return W / (2 * Math.PI) * Math.log(Math.tan(Math.PI / 4 + theta / 2));
    }

    function xToLambda(W, lambda_0, x) {
      return lambda_0 + x * 2 * Math.PI / W; 
    }

    function lambdaToX(W, lambda_0, lambda) {
      return W / (2 * Math.PI) * (lambda - lambda_0);
    }

    function getW(chartBounds) {
      return chartBounds.screen.right - chartBounds.screen.left;
    }

    function getLambda_0(chartBounds) {
      return toRadians(chartBounds.earth.left);
    }

    function getY_top(chartBounds) {
      var W = getW(chartBounds);
      var theta_top = toRadians(chartBounds.earth.top);
      return thetaToY(W, theta_top);
    }

    function toChart(chartBounds, long, lat) {
      var W = getW(chartBounds);

      var theta = toRadians(lat);
      var y = thetaToY(W, theta);
      var y_top = getY_top(chartBounds);
      var chartY = y_top - y;

      var lambda = toRadians(long);
      var lambda_0 = getLambda_0(chartBounds);
      var x = lambdaToX(W, lambda_0, lambda);
      var chartX = x;

      return {
        x: chartX,
        y: chartY
      };
    }

    function toEarth(chartBounds, chartX, chartY) {
      var W = getW(chartBounds);

      var lambda_0 = getLambda_0(chartBounds, chartX);
      var x = chartX;
      var lambda = xToLambda(W, lambda_0, x);
      var long = toDegrees(lambda);

      var y_top = getY_top(chartBounds);
      var y = y_top - chartY;
      var theta = yToTheta(W, y);
      var lat = toDegrees(theta); 

      return {
        long: long,
        lat: lat
      };
    }

    function bearing(chartBounds, fromLong, fromLat, toLong, toLat) {
      var fromChartCoords = toChart(chartBounds, fromLong, fromLat);
      var toChartCoords = toChart(chartBounds, toLong, toLat);
      var dx = toChartCoords.x - fromChartCoords.x;
      var dy = fromChartCoords.y - toChartCoords.y; // y increasing doing down, not up
      if (dy === 0) {
        if (dx === 0) return 0;
        if (dx > 0) return 90;
        return 270;
      }
      var theta = Math.atan(dx/dy);
      var degrees = toDegrees(theta);
      return toDegrees(theta) + (dy < 0 ? 180 : 0) + (dx < 0 && dy > 0 ? 360 : 0);
    }
  });

  (function() {
    function pad(num, size) {
      var s = "000" + num;
      return s.substr(s.length-size);
    }

    function format(degrees, positiveDirection, negativeDirection, padDegrees) {
      var positive = degrees >= 0;
      degrees = Math.abs(degrees);

      var wholeDegrees = Math.floor(degrees);
      var minutes = (degrees - wholeDegrees) * 60;
      var wholeMinutes = Math.floor(minutes);
      var seconds = (minutes - wholeMinutes) * 60;
      var wholeSeconds = Math.floor(seconds);

      return '' +
        pad(wholeDegrees, padDegrees) + '°' +
        pad(wholeMinutes, 2) + '′' +
        pad(wholeSeconds, 2) + '″' +
        (positive ? positiveDirection : negativeDirection);
    }

    app.filter('long', function() {
      return function(long) {
        if (long === null) return null;
        return format(long, 'E', 'W', 3);
      }
    });

    app.filter('lat', function() {
      return function(lat) {
        if (lat === null) return null;
        return format(lat, 'N', 'S', 2);
      }
    });

    app.filter('bearing', function() {
      return function(deg) {
        if (deg === null) return null;
        return format(deg, '', '', 3);
      }
    });
  })();

  app.directive('overlay', function() {
    return {
      restrict: 'A',
      controller: function($scope, $element) {
        var overlay = $element.find('overlay');
        this.show = function() {
          overlay.addClass('overlay-show');
          overlay.addClass('no-select');
          $element.addClass('no-select');
        };

        this.hide = function() {
          $element.removeClass('no-select');
          overlay.removeClass('no-select');
          overlay.removeClass('overlay-show')
        };
      }
    };
  });

  app.directive('reflow', function($window) {
    return {
      link: function(scope) {
        angular.element($window).on('resize scroll', function() {
          scope.$broadcast('reflow');
        });
      }
    };
  });

  app.directive('onDrag', function($document, $parse) {
    return {
      require: '^overlay',
      link: function(scope, element, attrs, overlay) {
        var offsetX = null;
        var offsetY = null;

        var root = element[0].nearestViewportElement;
        var parsedOnDrag = $parse(attrs.onDrag);

        var elementRect, rootRect;
        scope.$on('reflow', updateRects)
        function updateRects() {
          elementRect = element[0].getBoundingClientRect();
          rootRect = root.getBoundingClientRect();
        }

        scope.$$postDigest(function() {
          updateRects();
        });
        
        element.on('mousedown touchstart', function(e) {
          e.preventDefault();
          overlay.show();

          var elementRect = element[0].getBoundingClientRect();

          // At the moment assuming moving the center of the element
          offsetX = (e.touches ? e.touches[0].clientX : e.clientX) - (elementRect.right + elementRect.left) / 2;
          offsetY = (e.touches ? e.touches[0].clientY : e.clientY) - (elementRect.top + elementRect.bottom) / 2;

          $document.on('mousemove touchmove', onMouseMove);
          $document.on('mouseup touchend', onMouseUp);
        });

        scope.$on('$destroy', onMouseUp);

        function onMouseMove(e) {
          e.preventDefault();
          var x = clamp((e.touches ? e.touches[0].clientX : e.clientX)  - rootRect.left - offsetX, 0, rootRect.width);
          var y = clamp((e.touches ? e.touches[0].clientY : e.clientY) - rootRect.top - offsetY, 0, rootRect.height);
          parsedOnDrag(scope, {$x: x, $y: y});
        }

        function onMouseUp(e) {
          e.preventDefault();
          overlay.hide();

          offsetX = null;
          offsetY = null;

          $document.off('mousemove touchmove', onMouseMove);
          $document.off('mouseup touchend', onMouseUp);
        }
      }
    };
  });

  app.directive('chart', function(Mercator, $document, $parse) {
    return {
      restrict:'E',
      scope: true,
      template: function(tElement, tAttrs) {
        // Maybe have an entirely separate svg layer for map?
        return '' + 
          '<div>' +
            '<svg class="chart-map" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
              'width="' + tAttrs.width + '" height="' + tAttrs.height + '"' +
            '>' +
              '<image x="0" y="0" width="' + tAttrs.width + '" height="' + tAttrs.height  + '" xlink:href="{{ :: chart.src }}"/>' +
            '</svg>' +
            '<svg class="chart-widgets" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
              'width="' + tAttrs.width + '" height="' + tAttrs.height + '"' +
            '>' +
              '<defs>' +
                '<marker id="marker-arrow" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">' +
                  '<line x1="1" y1="1" x2="6" y2="6" style="stroke-width: 1; fill: none" stroke-dasharray="100%"/>' +
                  '<line x1="6" y1="6" x2="1" y2="11" style="stroke-width: 1; fill: none" stroke-dasharray="100%"/>' +
                '</marker>' +
              '</defs>' +
              '<line stroke-dasharray="2 2" ng-attr-x1="{{ toChart(circleCoords1).x }}" ng-attr-y1="{{ toChart(circleCoords1).y }}" ng-attr-x2="{{ toChart(circleCoords2).x }}" ng-attr-y2="{{ toChart(circleCoords2).y }}" style="marker-start:url(#marker-arrow); marker-end:url(#marker-arrow)"/>' +
              '<circle ng-attr-cx="{{ toChart(circleCoords1).x }}" ng-attr-cy="{{ toChart(circleCoords1).y }}" r="25" on-drag="onDrag(circleCoords1, $x, $y)"/>' +
              '<circle ng-attr-cx="{{ toChart(circleCoords2).x }}" ng-attr-cy="{{ toChart(circleCoords2).y }}" r="25" on-drag="onDrag(circleCoords2, $x, $y)"/>' +
            '</svg>' +
          '</div>';
      },
      link: function(scope, element, attrs) {
        scope.chart = scope.$eval(attrs.chart);
        scope.circleCoords1 = scope.$eval(attrs.circleCoords1);
        scope.circleCoords2 = scope.$eval(attrs.circleCoords2);

        if (scope.chart.projection != 'mercator') {
          throw new Error('Projection must be Mercator')
        }

        element.css({
          width: attrs.width + 'px',
          height: attrs.height + 'px'
        });

        scope.toChart = function(coords) {
          return Mercator.toChart(scope.chart.bounds, coords.long, coords.lat);
        };

        scope.onDrag = function(circleCoords, $x, $y) {
          var newCoords = Mercator.toEarth(scope.chart.bounds, $x, $y);
          scope.$apply(function() {
            circleCoords.lat = newCoords.lat;
            circleCoords.long = newCoords.long;
          });
        };
      }
    }
  });

  app.controller('MercatorController', function($scope, Mercator) {
    $scope.chart = {
      src: 'world.svg',
      projection: 'mercator',
      bounds: {
        earth: {
          top: 83.600842,
          bottom: -58.508473,
          left: -169.110266,
          right: 190.486279
        },
        screen: {
          top: 0,
          bottom: 665, 
          left: 0,
          right: 1010
        }
      }  
    };

    $scope.circleCoords1 = {
      lat: 0,
      long: 0
    };
    $scope.circleCoords2 = {
      lat: 30,
      long: 60
    };
    $scope.bearing = function() {
      return Mercator.bearing($scope.chart.bounds, $scope.circleCoords1.long, $scope.circleCoords1.lat, $scope.circleCoords2.long, $scope.circleCoords2.lat);
    };
  });

})(self);