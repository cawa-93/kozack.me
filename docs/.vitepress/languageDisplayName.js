export function languageDisplayName(code) {
  return new Intl.DisplayNames([code], {type: 'language'}).of(code)
}
