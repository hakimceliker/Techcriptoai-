import { fixture, NOW } from './fixture.js';
import { analyzeSnapshot } from '../src/index.js';
console.log(JSON.stringify(analyzeSnapshot(fixture(), NOW), null, 2));
