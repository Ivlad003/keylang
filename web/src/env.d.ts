// Ambient declarations for the web page bundle (web/src, built by esbuild).
// esbuild bundles a CSS import into diagrams.css next to the script, so a
// `.css` import has no value TypeScript needs to know.
declare module "*.css";
