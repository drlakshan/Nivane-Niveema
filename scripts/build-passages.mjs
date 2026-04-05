import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const sermonsDir = path.join(process.cwd(), 'content', 'sermons');
const supportDirs = [
  path.join(process.cwd(), 'content', 'indexes'),
  path.join(process.cwd(), 'content', 'glossary'),
  path.join(process.cwd(), 'content', 'summaries'),
];
const outputDir = path.join(process.cwd(), 'public', 'data');
const passagesFile = path.join(outputDir, 'passages.json');
const knowledgeFile = path.join(outputDir, 'knowledge.json');

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function splitBlocks(content) {
  return content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
}

const sermonFiles = (await readdir(sermonsDir)).filter((file) => file.endsWith('.md'));
const passages = [];

for (const file of sermonFiles) {
  const raw = await readFile(path.join(sermonsDir, file), 'utf8');
  const parsed = matter(raw);
  const slug = parsed.data.slug ?? slugify(parsed.data.title ?? file.replace(/\.md$/, ''));
  const blocks = splitBlocks(parsed.content);

  blocks.forEach((block, index) => {
    passages.push({
      id: `${slug}-p${String(index + 1).padStart(3, '0')}`,
      slug,
      title: parsed.data.title,
      sermon_number: parsed.data.sermon_number ?? null,
      url: `/sermons/${slug}/#${slug}-p${String(index + 1).padStart(3, '0')}`,
      text: block.replace(/\s+/g, ' ').trim(),
    });
  });
}

const knowledge = [];
for (const dir of supportDirs) {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md'));
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    const parsed = matter(raw);
    knowledge.push({
      slug: parsed.data.slug ?? slugify(parsed.data.title ?? file.replace(/\.md$/, '')),
      title: parsed.data.title ?? file.replace(/\.md$/, ''),
      type: parsed.data.type ?? 'support',
      aliases: parsed.data.aliases ?? [],
      text: parsed.content.replace(/\s+/g, ' ').trim(),
    });
  }
}

await mkdir(outputDir, { recursive: true });
await writeFile(passagesFile, JSON.stringify(passages, null, 2));
await writeFile(knowledgeFile, JSON.stringify(knowledge, null, 2));
console.log(`Wrote ${passages.length} passages to ${passagesFile}`);
console.log(`Wrote ${knowledge.length} support docs to ${knowledgeFile}`);
