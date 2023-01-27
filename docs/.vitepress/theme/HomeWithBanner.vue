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
.banner-container {
  margin: 0 auto;
  max-width: 1152px;
}

a {
  font-weight: bold;
  color: var(--vp-button-brand-bg);
}
</style>
