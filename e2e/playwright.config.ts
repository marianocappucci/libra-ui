import { defineConfig } from '@playwright/test'

// Los tests de las propias ayudas de `libra-ui/e2e`. Corren contra un servidor de Node mínimo (`test/servidor.ts`) que
// imita lo que usan las ayudas (el login con captcha, el gate de Términos, una cookie `Secure`); no hace falta ningún
// producto. Se corren desde esta carpeta: `npm run test:e2e`.
export default defineConfig({
  testDir: './test',
  testMatch: /.*\.spec\.ts/,
  timeout: 20_000,
  workers: 1,
  reporter: [['list']],
  use: { browserName: 'chromium' },
})
