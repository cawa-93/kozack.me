export function relativePathToUrl(p) {
  console.log(p)
  return p
    .replace(/\/?index\.md/, '/')
    .replace(/\.md/, '/index.html')
    .replace(/\/?index\.html/, '/')
}
