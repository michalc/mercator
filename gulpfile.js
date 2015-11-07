/* eslint-env node */

var gulp = require('gulp');
var eslint = require('gulp-eslint');
var changed = require('gulp-changed');
var merge = require('merge2');

// Requires dev dependencies to be installed
gulp.task('download-charts', function () {
  var download = require('gulp-download');
  var unzip = require('gulp-unzip');
  var url = 'http://www.ngdc.noaa.gov/mgg/shorelines/data/gshhg/latest/gshhg-shp-2.3.4.zip';
  return download(url)
    .pipe(unzip())
    .pipe(gulp.dest('data_src/'));
});

// Requires dev dependencies to be installed,
// and download-charts task to be run
gulp.task('generate-charts', function () {
  var mapJsonStream = require('./src/map-json-stream');
  var geojsonStream = require('geojson-stream');
  var path = require('path');

  var source = require('vinyl-source-stream')

  var root = 'data_src/WDBII_shp/c/'
  var inputs = [
    root + 'WDBII_border_c_L1.shp',
    root + 'WDBII_border_c_L2.shp',
    root + 'WDBII_border_c_L3.shp'
  ];
  var outputDir = 'data';

  var streams = inputs.map(function(input) {
    var output = path.basename(input, '.shp') + '.json';

    var mapStream = new mapJsonStream({}, input);
    var geojsonOut = geojsonStream.stringify();

    return mapStream
      .pipe(geojsonOut)
      .pipe(source(output))
      .pipe(gulp.dest(outputDir));
  });

  return merge(streams);
});

gulp.task('lint', function () {
  return gulp.src(['gulpfile.js', 'src/*.js'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

gulp.task('default', [], function() {
  var build = 'build';
  var dest = build;

  var dataSrc = 'data/*.json';
  var dataDest = build + '/data';
  var dataFiles = gulp.src(dataSrc)
    .pipe(changed(dataDest))
    .pipe(gulp.dest(dataDest));

  var src = [
    'src/*',
    '!src/map-json-stream.js'
  ];
  var srcFiles = gulp.src(src)
    .pipe(changed(dest))
    .pipe(gulp.dest(dest));

  var bowerSrcDir = 'bower_components';
  var bowerDest = build + '/bower_components';
  var files = [
    bowerSrcDir + '/lodash/lodash.js',
    bowerSrcDir + '/angular/angular.js',
    bowerSrcDir + '/normalize-css/normalize.css'
  ];

  var bowerFiles = gulp.src(files, {base: bowerSrcDir})
    .pipe(changed(bowerDest))
    .pipe(gulp.dest(bowerDest));

  return merge(dataFiles, srcFiles, bowerFiles);
});
