export function relativePathToUrl(p) {
  return p
    .replace(/\/?index\.md/, '/')
    .replace(/\.md/, '/index.html')
    .replace(/\/?index\.html/, '/')
}
