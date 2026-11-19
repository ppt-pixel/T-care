import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('desktop sidebar surface reaches the top edge without moving its header content', () => {
  assert.match(styles, /\.shell\.has-workspace-sidebar>\.top\s*\{z-index:30\}/);
  assert.match(styles, /\.workspace-sidebar\s*\{[^}]*top:0;[^}]*padding:90px 12px 14px/);
});

test('mobile sidebar keeps its full-height off-canvas layout and compact content padding', () => {
  assert.match(styles, /@media\(max-width:900px\)[\s\S]*?\.workspace-sidebar\{top:0;bottom:0;left:0;[^}]*padding:18px 13px/);
});

test('workspace navigation has a restrained themed scrollbar in Firefox and Chromium/WebKit', () => {
  assert.match(styles, /\.workspace-sidebar-nav\{[^}]*scrollbar-width:thin;scrollbar-color:/);
  assert.match(styles, /\.workspace-sidebar-nav::-webkit-scrollbar\{width:8px\}/);
  assert.match(styles, /\.workspace-sidebar-nav::-webkit-scrollbar-thumb\{[^}]*border-radius:999px/);
  assert.match(styles, /\.workspace-sidebar-nav::-webkit-scrollbar-thumb:hover\{/);
});
