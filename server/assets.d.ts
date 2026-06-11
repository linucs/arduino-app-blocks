// esbuild bundles *.css imports as text (loader: { '.css': 'text' }).
declare module '*.css' {
  const content: string;
  export default content;
}
