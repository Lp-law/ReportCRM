#!/usr/bin/env node
/**
 * Installs Puppeteer Chrome during build.
 * Runs on Render (RENDER=true) and CI to ensure PDF generation works.
 * Also runs when PUPPETEER_INSTALL_CHROME=1 for local/other environments.
 */
const shouldInstall =
  process.env.RENDER === 'true' ||
  process.env.CI === 'true' ||
  process.env.PUPPETEER_INSTALL_CHROME === '1';
if (shouldInstall) {
  const { execSync } = require('child_process');
  try {
    execSync('npx puppeteer browsers install chrome', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (e) {
    console.warn('Puppeteer Chrome install failed (non-fatal):', e.message);
  }
}
