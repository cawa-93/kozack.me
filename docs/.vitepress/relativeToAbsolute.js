import {withSlash} from "./withSlash";

/**
 *
 * @param {string} url
 * @return {string}
 */
export function relativeToAbsolute(url) {
  if (url.includes(':')) {
    return url
  }

  return `https://kozack.me${withSlash(url)}`;
}
