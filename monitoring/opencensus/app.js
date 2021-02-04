/*
Copyright 2020 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const express = require('express');
const app = express();
const Stopwatch = require('node-stopwatch').Stopwatch;

// sleep time expects milliseconds
function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

const projectId = 'stack-doctor';

// opencensus setup
const {globalStats, MeasureUnit, AggregationType} = require('@opencensus/core');
const {StackdriverStatsExporter} = require('@opencensus/exporter-stackdriver');

// Stackdriver export interval is 60 seconds
const EXPORT_INTERVAL = 60;

// define the "golden signals" metrics and views
// request count measure
const REQUEST_COUNT = globalStats.createMeasureInt64(
  'request_count',
  MeasureUnit.UNIT,
  'Number of requests to the server'
);
// request count view
const request_count_metric = globalStats.createView(
  'request_count_metric',
  REQUEST_COUNT,
  AggregationType.COUNT
);
globalStats.registerView(request_count_metric);

// error count measure
const ERROR_COUNT = globalStats.createMeasureInt64(
  'error_count',
  MeasureUnit.UNIT,
  'Number of failed requests to the server'
);
// error count view
const error_count_metric = globalStats.createView(
  'error_count_metric',
  ERROR_COUNT,
  AggregationType.COUNT
);
globalStats.registerView(error_count_metric);

// response latency measure
const RESPONSE_LATENCY = globalStats.createMeasureInt64(
  'response_latency',
  MeasureUnit.MS,
  'The server response latency in milliseconds'
);
// response latency view
const latency_metric = globalStats.createView(
  'response_latency_metric',
  RESPONSE_LATENCY,
  AggregationType.DISTRIBUTION,
  [],
  'Server response latency distribution',
  // Latency in buckets:
  [0, 1000, 2000, 3000, 4000, 5000, 10000]
);
globalStats.registerView(latency_metric);

// set up the Stackdriver exporter - hardcoding the project is bad!
// GOOGLE_APPLICATION_CREDENTIALS are expected by a dependency of this code
// Not this code itself. Checking for existence here but not retaining (as not needed)
if (!projectId || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // throw Error('Unable to proceed without a Project ID');
}
const exporter = new StackdriverStatsExporter({
  projectId: projectId,
  period: EXPORT_INTERVAL * 1000,
});
globalStats.registerExporter(exporter);

app.get('/', (req, res) => {
  // start request timer
  const stopwatch = Stopwatch.create();
  stopwatch.start();
  console.log('request made');

  // record a request count for every request
  globalStats.record([
    {
      measure: REQUEST_COUNT,
      value: 1,
    },
  ]);

  // randomly throw an error 10% of the time
  let randomValue = Math.floor(Math.random() * 9 + 1);
  if (randomValue === 1) {
    // Record a failed request.
    globalStats.record([
      {
        measure: ERROR_COUNT,
        value: 1,
      },
    ]);

    // Return error.
    res.status(500).send('failure');

    // Record latency.
    globalStats.record([
      {
        measure: RESPONSE_LATENCY,
        value: stopwatch.elapsedMilliseconds,
      },
    ]);
    stopwatch.stop();
  }
  // End random error.

  // Sleep for a random number of seconds.
  randomValue = Math.floor(Math.random() * 9 + 1);
  sleep(randomValue).then(() => {
    // Send successful response.
    res
      .status(200)
      .send('success after waiting for ' + randomValue + ' seconds');

    // Record latency for every request.
    globalStats.record([
      {
        measure: RESPONSE_LATENCY,
        value: stopwatch.elapsedMilliseconds,
      },
    ]);
    stopwatch.stop();
  });
});

app.listen(8080, () => console.log('Example app listening on port 8080!'));
