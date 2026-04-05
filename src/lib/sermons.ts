import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export interface Sermon {
  slug: string;
  body: string;
  html: string;
  data: {
    title: string;
    author?: string;
    type?: string;
    book?: string;
    sermon_number?: number;
    section_order?: number;
    description?: string;
  };
}

const sermonsDir = path.join(process.cwd(), 'content', 'sermons');

export async function getSermons(): Promise<Sermon[]> {
  const files = (await readdir(sermonsDir)).filter((file) => file.endsWith('.md'));
  const sermons = await Promise.all(files.map(async (file) => {
    const raw = await readFile(path.join(sermonsDir, file), 'utf8');
    const parsed = matter(raw);
    return {
      slug: file.replace(/\.md$/, ''),
      body: parsed.content,
      html: await marked(parsed.content),
      data: parsed.data as Sermon['data'],
    };
  }));

  return sermons.sort((a, b) => (a.data.section_order ?? 999) - (b.data.section_order ?? 999));
}

export async function getSermonBySlug(slug: string): Promise<Sermon | undefined> {
  const sermons = await getSermons();
  return sermons.find((sermon) => sermon.slug === slug);
}
