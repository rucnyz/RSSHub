import { load } from 'cheerio';

import type { Data, DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://alphaxiv.org';

export const route: Route = {
    path: '/trending',
    categories: ['journal'],
    example: '/alphaxiv/trending',
    url: 'alphaxiv.org',
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
            source: ['alphaxiv.org/', 'alphaxiv.org'],
            target: '/trending',
        },
    ],
    name: 'Trending Papers',
    maintainers: ['rucnyz'],
    handler,
    description: 'Trending research papers on AlphaXiv.',
    view: ViewType.Articles,
};

async function handler(): Promise<Data> {
    const html = await ofetch(baseUrl);
    const $ = load(html);

    const items: DataItem[] = [];

    $('a[href^="/abs/"]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href');
        if (!href) {
            return;
        }

        const paperId = href.replace('/abs/', '');

        // Skip duplicate links (each paper card may have multiple <a> tags)
        if (items.some((item) => item.link?.includes(paperId))) {
            return;
        }

        // The title is in a div inside the <a> tag
        const titleEl = $a.find('div.font-bold');
        if (!titleEl.length) {
            return;
        }
        const title = titleEl.text().trim();
        if (!title) {
            return;
        }

        // Navigate up to the card container to find date, authors, summary
        const card = $a.closest('div[data-onboarding], div.rounded-xl');

        // Date
        const dateText = card.find('span.text-sm.font-medium.whitespace-nowrap').first().text().trim();

        // Authors
        const authors: string[] = [];
        card.find('div.flex.items-center.gap-1\\.5.font-normal').each((_, authorEl) => {
            const name = $(authorEl).text().trim();
            if (name) {
                authors.push(name);
            }
        });

        // Summary (the <p> with line-clamp)
        const summaryEl = card.find('p.line-clamp-4');
        // Get text content, stripping SVG icons
        const summaryClone = summaryEl.clone();
        summaryClone.find('svg').remove();
        const summary = summaryClone.find('span').text().trim() || summaryClone.text().trim();

        // Preview image
        const imgSrc = `https://paper-assets.alphaxiv.org/image/${paperId}.png`;

        items.push({
            title,
            link: `${baseUrl}/abs/${paperId}`,
            description: `<img src="${imgSrc}"><p>${summary}</p>`,
            pubDate: dateText ? parseDate(dateText) : undefined,
            author: authors.join(', '),
        });
    });

    return {
        title: 'AlphaXiv - Trending Papers',
        link: baseUrl,
        description: 'Trending research papers on AlphaXiv',
        item: items,
        language: 'en',
    };
}
