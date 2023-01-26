export function withSlash(pagePath) {
  return pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
}
