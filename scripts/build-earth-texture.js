'use strict';

const { buildEarthSeed, IMAGE_SEED } = require('../earth-texture');

buildEarthSeed().then(body => {
  process.stdout.write(`Prepared NASA Blue Marble image seed at ${IMAGE_SEED} (${body.length} bytes).\n`);
}).catch(error => {
  console.error(`Failed to prepare NASA Blue Marble image seed: ${error?.message || error}`);
  process.exitCode = 1;
});
