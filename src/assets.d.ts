// Pictures imported by the page: Vite puts them inside the one HTML file and gives their address.
declare module '*.png' {
  const url: string;
  export default url;
}

/** The commit the page was built from (written in by vite.config.ts): a full id, "<id>-dirty", or "unknown". */
declare const __BUILD_COMMIT__: string;
