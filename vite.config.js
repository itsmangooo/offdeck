import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three-core', test: /\/three\/build\/three\.core\.js$/ }]
        }
      }
    }
  }
})
