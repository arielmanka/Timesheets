import { cpSync } from 'fs';

// tsc only compiles .ts files — non-TS assets (e.g. PDF export fonts) need
// to be copied into dist/ separately for the production build to find them
// at the same relative path they're referenced from in src/.
cpSync('src/assets', 'dist/assets', { recursive: true });
