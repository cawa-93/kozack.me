<script setup>
import DefaultTheme from 'vitepress/theme'
import {useData} from "vitepress";

const {Layout} = DefaultTheme
const {frontmatter} = useData()
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <div class="banner-container">
        <div class="tip custom-block">
          <p class="custom-block-title" v-if="frontmatter.banner.title">{{frontmatter.banner.title}}</p>
          <p v-if="frontmatter.banner.content">{{frontmatter.banner.content}}</p>
          <p v-if="frontmatter.banner.link">
            <a :href="frontmatter.banner.link.url">{{frontmatter.banner.link.content}}</a>
          </p>
        </div>
      </div>
    </template>
  </Layout>
</template>

<style scoped>
html:not(.dark) .banner-container {
  --vp-custom-block-tip-text: var(--vp-c-green-dark);
}

html.dark .banner-container {
  --vp-custom-block-tip-text: var(--vp-c-green-lighter);
}

.banner-container {
  position: relative;
  padding: 0 24px;
  margin-block-start: 1em;
}

@media (min-width: 640px) {
  .banner-container {
    padding: 0 48px;
  }
}

@media (min-width: 960px) {
  .banner-container {
    padding: 0 64px;
  }
}

.custom-block {
  margin: 0 auto;
  max-width: 1152px;
}

a {
  font-weight: bold;
  color: var(--vp-c-brand-dark);
}
</style>
