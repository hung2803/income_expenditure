import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCloudConfig } from './cloud-config.mjs';
import { createLocalArgs } from './local-config.mjs';

function fixture() {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  config.env.dev.d1_databases[0].database_id = '11111111-1111-4111-8111-111111111111';
  config.env.test.d1_databases[0].database_id = '22222222-2222-4222-8222-222222222222';
  config.env.prod.d1_databases[0].database_id = '33333333-3333-4333-8333-333333333333';
  config.env.prod.vars.CORS_ORIGINS = 'https://finance.example.com';
  return config;
}

describe('Cloud environment guards', () => {
  it('accepts isolated configured environments', () => {
    for (const environment of ['dev', 'test', 'prod']) assert.equal(validateCloudConfig(fixture(), environment).environment, environment);
  });
  it('rejects placeholders and an implicit/unknown target', () => {
    const placeholders = fixture();
    placeholders.env.dev.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000001';
    assert.throws(() => validateCloudConfig(placeholders, 'dev'));
    assert.throws(() => validateCloudConfig(fixture(), undefined));
    assert.throws(() => validateCloudConfig(fixture(), 'staging'));
  });
  it('prevents test and prod from using the same database', () => {
    const config = fixture();
    config.env.test.d1_databases[0].database_id = config.env.prod.d1_databases[0].database_id;
    assert.throws(() => validateCloudConfig(config, 'test'));
  });
  it('rejects unsafe production CORS settings and mismatched environment values', () => {
    for (const origin of ['', '*', 'http://finance.example.com', 'https://user:secret@finance.example.com', 'https://finance.example.com/path']) {
      const config = fixture(); config.env.prod.vars.CORS_ORIGINS = origin;
      assert.throws(() => validateCloudConfig(config, 'prod'));
    }
    const config = fixture(); config.env.test.vars.APP_ENV = 'prod';
    assert.throws(() => validateCloudConfig(config, 'test'));
  });
});

describe('Local environment isolation', () => {
  it('uses distinct state roots and applies the Docker host override only once', () => {
    const dev = createLocalArgs('serve', 'dev', ['--ip', '0.0.0.0']);
    const test = createLocalArgs('serve', 'test');
    assert.equal(dev.filter((value) => value === '--ip').length, 1);
    assert.equal(dev[dev.indexOf('--ip') + 1], '0.0.0.0');
    assert.notEqual(dev[dev.indexOf('--persist-to') + 1], test[test.indexOf('--persist-to') + 1]);
    assert(createLocalArgs('migrate', 'test').includes('--local'));
  });
  it('rejects remote/prod overrides and unexpected flags in local commands', () => {
    assert.throws(() => createLocalArgs('serve', 'prod'));
    assert.throws(() => createLocalArgs('serve', 'test', ['--remote', 'true']));
    assert.throws(() => createLocalArgs('serve', 'dev', ['--env', 'prod']));
    assert.throws(() => createLocalArgs('migrate', 'test', ['--remote']));
    assert.throws(() => createLocalArgs('serve', 'dev', ['--port', '99999']));
  });
});
