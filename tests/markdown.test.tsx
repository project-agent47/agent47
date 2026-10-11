import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../src/renderer/Markdown';

it('renders GFM tables and code but never executes HTML, images or links', () => {
  const output = renderToStaticMarkup(<Markdown>{'# Heading\n\n**bold**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```\n\n<script>alert(1)</script>\n\n![tracking](https://example.org/tracker.png)\n\n[run](javascript:alert(1))'}</Markdown>);
  expect(output).toContain('<table>');
  expect(output).toContain('<strong>bold</strong>');
  expect(output).toContain('language-js');
  expect(output).not.toContain('<script');
  expect(output).not.toContain('<img');
  expect(output).not.toContain('<a ');
  expect(output).not.toContain('javascript:');
});
