// Pictures imported by the page: Vite puts them inside the one HTML file and gives their address.
declare module '*.png' {
  const url: string;
  export default url;
}
