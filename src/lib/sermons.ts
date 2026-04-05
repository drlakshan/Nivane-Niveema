import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export interface SermonBlock {
  id: string;
  markdown: string;
  html: string;
  text: string;
}

export interface Sermon {
  slug: string;
  body: string;
  blocks: SermonBlock[];
  data: {
    title: string;
    author?: string;
    type?: string;
    book?: string;
    sermon_number?: number;
    section_order?: number;
    description?: string;
    slug?: string;
  };
}

const sermonsDir = path.join(process.cwd(), 'content', 'sermons');

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizeContent(content: string) {
  return content
    .replaceAll('(./assets/', '(/assets/')
    .replaceAll('](./assets/', '](/assets/')
    .replaceAll('src="./assets/', 'src="/assets/');
}

function splitBlocks(content: string) {
  return content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
}

export async function getSermons(): Promise<Sermon[]> {
  const files = (await readdir(sermonsDir)).filter((file) => file.endsWith('.md'));
  const sermons = await Promise.all(files.map(async (file) => {
    const raw = await readFile(path.join(sermonsDir, file), 'utf8');
    const parsed = matter(raw);
    const content = normalizeContent(parsed.content);
    const fallbackSlug = slugify((parsed.data.title as string | undefined) ?? file.replace(/\.md$/, ''));
    const slug = (parsed.data.slug as string | undefined) ?? fallbackSlug;
    const rawBlocks = splitBlocks(content);
    const blocks = await Promise.all(rawBlocks.map(async (block, index) => ({
      id: `${slug}-p${String(index + 1).padStart(3, '0')}`,
      markdown: block,
      html: await marked(block),
      text: block.replace(/\s+/g, ' ').trim(),
    })));

    return {
      slug,
      body: content,
      blocks,
      data: parsed.data as Sermon['data'],
    };
  }));

  return sermons.sort((a, b) => (a.data.section_order ?? 999) - (b.data.section_order ?? 999));
}

export async function getSermonBySlug(slug: string): Promise<Sermon | undefined> {
  const sermons = await getSermons();
  return sermons.find((sermon) => sermon.slug === slug);
}
