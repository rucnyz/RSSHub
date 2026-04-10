import { load } from 'cheerio';

import type { Data, DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import parser from '@/utils/rss-parser';

export const route: Route = {
    path: '/blog',
    categories: ['programming'],
    example: '/vllm/blog',
    url: 'vllm.ai/blog',
    parameters: {},
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
            source: ['vllm.ai/blog', 'vllm.ai/blog/*'],
            target: '/blog',
        },
    ],
    name: 'Blog',
    maintainers: ['gyc-12'],
    handler,
    description: 'Provides full-text articles from the vLLM blog, covering release announcements, performance optimizations, model support, and community updates.',
    view: ViewType.Articles,
};

async function handler(): Promise<Data> {
    const feed = await parser.parseURL('https://vllm.ai/blog/rss.xml');

    const items = await Promise.all(
        feed.items.map((item) =>
            cache.tryGet(item.link as string, async () => {
                const data = await ofetch(item.link as string);
                const $ = load(data);

                const article = $('article.max-w-3xl');

                // Remove non-content elements: table of contents, share buttons, post navigation, related posts
                article.find('footer').remove();
                article.find('nav[aria-label="Post navigation"]').remove();
                article.find('aside').remove();
                // Remove mobile TOC toggle
                article.find('.lg\\:hidden').first().remove();

                // Extract the header info
                const header = article.find('header');

                // Get the main content (everything after header, before removed footer)
                header.remove();

                // Clean up HTML attributes for cleaner output
                article.find('[class]').removeAttr('class');
                article.find('[style]').removeAttr('style');
                article.find('script').remove();

                return {
                    title: item.title,
                    link: item.link,
                    description: article.html() || item.contentSnippet,
                    pubDate: item.pubDate,
                    author: item.creator,
                    category: item.categories,
                } as DataItem;
            })
        )
    );

    return {
        title: feed.title ?? 'vLLM Blog',
        link: 'https://vllm.ai/blog',
        description: feed.description ?? 'Technical articles, release announcements, and community updates from the vLLM project.',
        image: 'https://vllm.ai/vLLM-Logo.png',
        item: items,
        language: 'en',
    };
}
