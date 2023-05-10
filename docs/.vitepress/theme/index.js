import DefaultTheme from 'vitepress/theme'
import './styles/fonts.css'
import './styles/colors.css'
import './styles/header.css'

// .vitepress/theme/index.js
import MyLayout from './HomeWithBanner.vue'

export default {
  ...DefaultTheme,
  // override the Layout with a wrapper component that
  // injects the slots
  Layout: MyLayout
}
