import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const response = await fetch('https://top.baidu.com/board?tab=realtime', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' },
            next: { revalidate: 300 }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch Baidu hot search');
        }

        const html = await response.text();
        
        // Extract the target text. Baidu uses <div class="c-single-text-ellipsis"> TEXT </div>
        const matches = [...html.matchAll(/c-single-text-ellipsis">([^<]+)<\//g)];
        const items = matches.map(m => m[1].trim()).filter(Boolean);

        // Split the items into "Weibo" (Top 5 trends) and "News" (Next 5 trends) to fulfill the UI placeholders
        const weiboData = items.slice(0, 5).map((title, i) => ({
            id: `wb-${i}`,
            title: title.length > 20 ? title.substring(0, 20) + '...' : title,
            isHot: i < 3,
            url: `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
            source: 'weibo',
            rank: i + 1,
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

        const newsData = items.slice(5, 10).map((title, i) => ({
            id: `news-${i}`,
            title: title.length > 20 ? title.substring(0, 20) + '...' : title,
            isHot: i < 3,
            url: `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
            source: 'news',
            rank: i + 1,
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

        return NextResponse.json({ weibo: weiboData, news: newsData });

    } catch (error) {
        console.error('Error in /api/news:', error);
        return NextResponse.json({ weibo: [], news: [] });
    }
}
