import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repository = process.env.GITHUB_REPOSITORY ?? ''
const repoName = repository.split('/')[1] ?? ''
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
const isUserSite = repoName.endsWith('.github.io')

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubActions && repoName && !isUserSite ? `/${repoName}/` : '/',
  plugins: [react()],
  build: {
    outDir: 'doc',
  },
})
