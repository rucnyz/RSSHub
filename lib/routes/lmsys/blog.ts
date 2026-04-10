import { load } from 'cheerio';

import type { Data, DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://www.lmsys.org';

interface LmsysPost {
    slug: string;
    title: string;
    author: string;
    date: string;
    previewImg: string;
    excerpt: string;
    category: string;
    type: string;
}

function extractPosts(html: string): LmsysPost[] {
    // The Next.js RSC payload contains the posts array as JSON embedded in self.__next_f.push()
    const match = html.match(/self\.__next_f\.push\(\[.*?".*?\]\)/s);
    if (!match) {
        return [];
    }

    // Decode the escaped JSON string
    const pushCalls = [...html.matchAll(/self\.__next_f\.push\(\[(.*?)\]\)/gs)];
    for (const call of pushCalls) {
        const raw = call[1];
        if (!raw.includes('slug')) {
            continue;
        }

        const parts = raw.split(',');
        parts.shift(); // Remove the first element (type indicator)
        const jsonStr = parts.join(',').trim().replace(/^"|"$/g, '');
        const decoded = JSON.parse(`"${jsonStr}"`);

        // Find the JSON array of posts
        const arrStart = decoded.indexOf('[{"slug"');
        if (arrStart === -1) {
            continue;
        }

        let depth = 0;
        let arrEnd = arrStart;
        for (let i = arrStart; i < decoded.length; i++) {
            if (decoded[i] === '[') {
                depth++;
            } else if (decoded[i] === ']') {
                depth--;
                if (depth === 0) {
                    arrEnd = i + 1;
                    break;
                }
            }
        }

        return JSON.parse(decoded.slice(arrStart, arrEnd)) as LmsysPost[];
    }

    return [];
}

export const route: Route = {
    path: '/blog/:category?',
    categories: ['programming'],
    example: '/lmsys/blog',
    url: 'lmsys.org/blog',
    parameters: {
        category: {
            description: 'Category filter',
            options: [
                { value: 'sglang', label: 'SGLang' },
                { value: 'chatbot', label: 'Chatbot Arena' },
                { value: 'general', label: 'General' },
            ],
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['lmsys.org/blog', 'lmsys.org/blog/*'],
            target: '/blog',
        },
    ],
    name: 'Blog',
    maintainers: ['rucnyz'],
    handler,
    description: 'Blog posts from LMSYS covering SGLang, Chatbot Arena, and LLM research.',
    view: ViewType.Articles,
};

async function handler(ctx): Promise<Data> {
    const category = ctx.req.param('category');

    const html = await ofetch(`${baseUrl}/blog`);
    let posts = extractPosts(html);

    if (category) {
        posts = posts.filter((p) => p.category === category);
    }

    const items = await Promise.all(
        posts.map((post) =>
            cache.tryGet(`lmsys:blog:${post.slug}`, async () => {
                const postHtml = await ofetch(`${baseUrl}/blog/${post.slug}`);
                const $ = load(postHtml);

                const content = $('div.blog-post-content');
                content.find('script').remove();
                content.find('[class]').removeAttr('class');
                content.find('[style]').removeAttr('style');

                // Fix relative image paths
                content.find('img').each((_, el) => {
                    const src = $(el).attr('src');
                    if (src && src.startsWith('/')) {
                        $(el).attr('src', `${baseUrl}${src}`);
                    }
                });

                const previewHtml = post.previewImg ? `<img src="${baseUrl}${post.previewImg}">` : '';

                return {
                    title: post.title,
                    link: `${baseUrl}/blog/${post.slug}`,
                    description: content.html() || `${previewHtml}<p>${post.excerpt}</p>`,
                    pubDate: parseDate(post.date),
                    author: post.author,
                    category: [post.category, post.type],
                } as DataItem;
            })
        )
    );

    return {
        title: category ? `LMSYS Blog - ${category}` : 'LMSYS Blog',
        link: `${baseUrl}/blog`,
        description: 'Blog posts from LMSYS covering SGLang, Chatbot Arena, and LLM research.',
        item: items,
        language: 'en',
    };
}
