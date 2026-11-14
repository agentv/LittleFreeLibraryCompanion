// Lets Node's type stripping run the app's TypeScript, whose imports have no
// file extensions (Metro resolves them in the app).
import { register } from 'node:module';

register('./resolve-ts.mjs', import.meta.url);
