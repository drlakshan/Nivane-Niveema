import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const sermonsDir = path.join(process.cwd(), 'content', 'sermons');
const outputDir = path.join(process.cwd(), 'public', 'data');
const outputFile = path.join(outputDir, 'passages.json');

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

const files = (await readdir(sermonsDir)).filter((file) => file.endsWith('.md'));
const passages = [];

for (const file of files) {
  const raw = await readFile(path.join(sermonsDir, file), 'utf8');
  const parsed = matter(raw);
  passages.push({
    slug: parsed.data.slug ?? slugify(parsed.data.title ?? file.replace(/\.md$/, '')),
    title: parsed.data.title,
    sermon_number: parsed.data.sermon_number ?? null,
    text: parsed.content.trim(),
  });
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, JSON.stringify(passages, null, 2));
console.log(`Wrote ${passages.length} passages to ${outputFile}`);
