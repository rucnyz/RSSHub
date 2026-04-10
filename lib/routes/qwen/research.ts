import MarkdownIt from 'markdown-it';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const md = new MarkdownIt({
    html: true,
    breaks: true,
});

interface ResearchArticle {
    id: string;
    title: string;
    date: string;
    description?: string;
    introduction: string;
    tags: string[];
    cover?: string;
    cover_small?: string;
    authors?: string[];
    author?: string;
    tokenLinks?: string;
}

interface RetrievalArticle {
    id: string;
    type: string;
    title: string;
    content: string;
    path: string;
    language: string;
    extra: {
        introduction?: string;
        description?: string;
        tags?: string[];
        cover_small?: string;
        date?: string;
        author?: string;
        readTime?: number;
        wordCount?: number;
    };
}

const extractExternalLinks = (tokens: Array<Record<string, string>>): Array<{ href: string; label: string }> => {
    const links: Array<{ href: string; label: string }> = [];
    for (const token of tokens) {
        if (token.type === 'hugoButton' && token.href && token.label) {
            links.push({ href: token.href, label: token.label });
        }
    }
    return links;
};

export const route: Route = {
    path: '/research/:language?/:tag?',
    categories: ['programming'],
    example: '/qwen/research',
    parameters: {
        language: {
            description: 'Language',
            options: [
                { value: 'en', label: 'English' },
                { value: 'zh-cn', label: '中文' },
            ],
            default: 'en',
        },
        tag: {
            description: 'Filter by tag',
            options: [
                { value: 'Research', label: 'Research' },
                { value: 'Open-Source', label: 'Open Source' },
                { value: 'Release', label: 'Release' },
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
            source: ['qwen.ai/research'],
            target: '/qwen/research',
        },
    ],
    name: 'Research',
    maintainers: ['27Aaron'],
    url: 'qwen.ai',
    description: '通义千问研究文章，支持中英文切换和标签筛选',
    handler: async (ctx) => {
        const language = ctx.req.param('language') ?? 'en';
        const validLanguages = ['en', 'zh-cn'];
        const lang = validLanguages.includes(language) ? language : 'en';
        const tag = ctx.req.param('tag');
        const validTags = ['Research', 'Open-Source', 'Release'];
        const filterTag = tag && validTags.includes(tag as string) ? tag : undefined;

        const retrievalLang = lang === 'zh-cn' ? 'zh-CN' : 'en-US';

        const [legacyList, retrievalResponse] = await Promise.all([
            ofetch<ResearchArticle[]>('https://qwen.ai/api/page_config', {
                params: { code: 'research.research-list', language: lang },
            }),
            ofetch<{ data: { articles: RetrievalArticle[] } }>('https://qwen.ai/api/v2/article/retrieval', {
                params: { type: 'qwen_ai', language: retrievalLang },
            }),
        ]);

        const retrievalArticles = retrievalResponse.data?.articles || [];
        const retrievalPaths = new Set(retrievalArticles.map((a) => a.path));

        // Deduplicate: retrieval articles take priority; legacy articles fill the rest
        const legacyOnly = legacyList.filter((item) => !retrievalPaths.has(item.id));

        const retrievalItems = retrievalArticles
            .filter((a) => !filterTag || a.extra?.tags?.includes(filterTag))
            .map((a) => ({
                title: a.title,
                link: `https://qwen.ai/blog?id=${a.path}`,
                pubDate: a.extra?.date ? parseDate(a.extra.date) : undefined,
                author: a.extra?.author,
                category: a.extra?.tags,
                description: `${a.extra?.cover_small ? `<img src="${a.extra.cover_small}">` : ''}${md.render(a.extra?.introduction || a.extra?.description || '')}`,
            }));

        const legacyFiltered = filterTag ? legacyOnly.filter((item) => item.tags?.includes(filterTag)) : legacyOnly;

        const legacyItems = await Promise.all(
            legacyFiltered.map((item) =>
                cache.tryGet(`qwen:research:${lang}:${item.id}`, async () => {
                    let content = item.introduction || item.description || '';

                    if (item.tokenLinks) {
                        try {
                            const tokens: Array<Record<string, string>> = await ofetch(item.tokenLinks);
                            const links = extractExternalLinks(tokens);
                            if (links.length) {
                                content += '\n\n' + links.map((l) => `[${l.label}](${l.href})`).join(' | ');
                            }
                        } catch {
                            /* ignore */
                        }
                    }

                    const coverHtml = item.cover ? `<img src="${item.cover}">` : '';
                    return {
                        title: item.title,
                        link: `https://qwen.ai/blog?id=${item.id}`,
                        pubDate: parseDate(item.date),
                        author: item.authors?.join(', ') ?? item.author,
                        category: item.tags,
                        description: `${coverHtml}${md.render(content)}`,
                    };
                })
            )
        );

        const items = [...retrievalItems, ...legacyItems].sort((a, b) => {
            const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
            const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
            return db - da;
        });

        const titlePrefix = lang === 'zh-cn' ? 'Qwen 研究' : 'Qwen Research';
        const titleSuffix = filterTag ? ` - ${filterTag}` : '';

        return {
            title: `${titlePrefix}${titleSuffix}`,
            link: 'https://qwen.ai/research',
            item: items,
        };
    },
};
