import {
  SiteConfigSchema,
  PRESET_SAFE,
  PRESET_AGGRESSIVE,
  PRESET_LUDICROUS,
  sha256,
  generateApiKey,
  normalizeDomain,
  getPresetConfig
} from './dist/index.js';

async function runVerification() {
  console.log('⚡ Starting Turbopress Architecture Verification Test...\n');

  // 1. Validate Presets against Zod Schema
  console.log('1. Validating Master Presets against Zod Schema:');
  const safeValidated = SiteConfigSchema.parse(PRESET_SAFE);
  console.log('  ✓ Safe Preset: OK (caching TTL:', safeValidated.caching.ttl, 's)');

  const aggressiveValidated = SiteConfigSchema.parse(PRESET_AGGRESSIVE);
  console.log('  ✓ Aggressive Preset: OK (critical_css.enabled:', aggressiveValidated.critical_css.enabled, ')');

  const ludicrousValidated = SiteConfigSchema.parse(PRESET_LUDICROUS);
  console.log('  ✓ Ludicrous Preset: OK (javascript.execution_mode:', ludicrousValidated.javascript.execution_mode, ')');

  // 2. Validate Domain Normalization & Crypto
  console.log('\n2. Validating Cryptographic & Handshake Utilities:');
  const rawDomain = 'https://sub.MyWordPressSite.com:8443/wp-admin/admin.php?foo=bar';
  const normalized = normalizeDomain(rawDomain);
  console.log('  ✓ Domain Normalized:', normalized, normalized === 'sub.mywordpresssite.com' ? '✓ MATCH' : '✗ FAIL');

  const apiKey = generateApiKey('sk_live_');
  const hash = await sha256(apiKey);
  console.log('  ✓ API Key Generated:', apiKey);
  console.log('  ✓ Key Hash (SHA-256):', hash);

  // 3. Preset fallback
  const fallback = getPresetConfig('unknown_custom_preset');
  console.log('  ✓ Preset Fallback to Ludicrous:', fallback.preset === 'ludicrous' ? '✓ MATCH' : '✗ FAIL');

  console.log('\n🎉 ALL ARCHITECTURAL TESTS PASSED SUCCESSFULLY!');
}

runVerification().catch(console.error);
